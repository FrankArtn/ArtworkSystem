export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { PassThrough } from "stream";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });
const money = (n) => (Number(n) || 0).toFixed(2);

// Thai-capable fonts
const FONT_REGULAR = path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf");
const FONT_BOLD    = path.join(process.cwd(), "public", "fonts", "NotoSansThai-Bold.ttf");

async function getCols(table) {
  const r = await query(`PRAGMA table_info(${table})`);
  const names = new Set((r.rows || []).map(x => x.name));
  return { has: (c) => names.has(c) };
}

export async function GET(_req, { params }) {
  try {
    const { id } = await params; // Next 15: await params
    const qid = Number(id);
    if (!Number.isFinite(qid)) return jerr("invalid quote id");

    // Quote header (includes customer + transportation_cost if present)
    const qcols = await getCols("quotes");
    const transSel = qcols.has("transportation_cost")
      ? "COALESCE(transportation_cost,0) AS transportation_cost"
      : "0 AS transportation_cost";

    const q = await query(
      `SELECT id, quote_number, COALESCE(status,'draft') AS status, customer, created_at, ${transSel}
         FROM quotes
        WHERE id = ?
        LIMIT 1`,
      [qid]
    );
    if (!q.rows?.length) return jerr("quote not found", 404);
    const quote = q.rows[0];

    // Items
    const pcols = await getCols("products");
    const qic   = await getCols("quote_items");

    const skuSel   = pcols.has("sku")  ? "p.sku"       : "NULL AS sku";
    const nameSel  = pcols.has("name") ? "p.name"      : "CAST(p.id AS TEXT) AS name";
    const unitSel  = pcols.has("unit") ? "p.unit"      : "NULL AS unit"; // not rendered, but keep for future
    const saleSel  = qic.has("sale_price") ? "qi.sale_price" : (qic.has("price") ? "qi.price" : "0");
    const costSel  = qic.has("cost_price") ? "qi.cost_price" : (qic.has("cost") ? "qi.cost" : "0");
    const lenSel   = qic.has("length_m") ? "qi.length_m" : "NULL AS length_m";
    const widSel   = qic.has("width_m")  ? "qi.width_m"  : "NULL AS width_m";
    const areaSel  = qic.has("area_sqm") ? "qi.area_sqm" : "NULL AS area_sqm";

    const itemsRes = await query(
      `SELECT
         ${nameSel},
         ${skuSel},
         ${unitSel},
         qi.qty,
         COALESCE(${saleSel},0) AS sale_price,
         COALESCE(${costSel},0) AS cost_price,
         ${lenSel},
         ${widSel},
         ${areaSel}
       FROM quote_items qi
       JOIN products p ON p.id = qi.product_id
       WHERE qi.quote_id = ?
       ORDER BY qi.id ASC`,
      [qid]
    );
    const items = itemsRes.rows || [];

    // --- PDF ---
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 60, left: 40, right: 40 },
    });
    const stream = new PassThrough();
    doc.pipe(stream);

    // Fonts
    doc.registerFont("thai", fs.readFileSync(FONT_REGULAR));
    doc.registerFont("thai-bold", fs.readFileSync(FONT_BOLD));
    const setBody = (size = 10) => doc.font("thai").fontSize(size).fillColor("#000");
    const setBold = (size = 10) => doc.font("thai-bold").fontSize(size).fillColor("#000");

    // Title
    setBold(18);
    doc.text("Quote", { align: "left" });
    doc.moveDown(0.3);

    setBody(10);
    const qno = quote.quote_number || `QUO-${String(quote.id).padStart(6, "0")}`;
    doc.text(`Quote #: ${qno}`);
    doc.text(`Status: ${quote.status}`);
    doc.text(`Customer: ${quote.customer?.trim() ? quote.customer : "—"}`);
    if (quote.created_at) doc.text(`Created: ${quote.created_at}`);
    doc.moveDown(0.8);

    // Table layout: Product | SKU | Unit Price (Total/Qty) | Qty | Total
    const pageWidth = doc.page.width;
    const { left, right, top, bottom } = doc.page.margins;
    const contentWidth = pageWidth - left - right;
    const startX = left;
    let y = doc.y;

    const cols = {
      product: 0.35,
      sku:     0.15,
      sale:    0.20, // total/qty shown here
      qty:     0.10,
      total:   0.20,
    };

    const cw = {};
    Object.keys(cols).forEach(k => (cw[k] = Math.floor(cols[k] * contentWidth)));

    const headerHeight = 18;
    const rowPadV = 4;
    const rowGap = 2;

    function maybePageBreak(neededHeight) {
      const maxY = doc.page.height - bottom;
      if (y + neededHeight > maxY) {
        doc.addPage();
        y = top;
        drawHeader();
      }
    }

    function drawHeader() {
      setBold(10);
      let cx = startX;
      const h = headerHeight;

      doc.rect(startX, y, contentWidth, h).fillOpacity(0.05).fill("#000000").fillOpacity(1);

      doc.fillColor("#000").text("Product",   cx + 4, y + 4, { width: cw.product - 8 }); cx += cw.product;
      doc.text("SKU",                         cx + 4, y + 4, { width: cw.sku - 8 });     cx += cw.sku;
      doc.text("Unit Price",                  cx + 4, y + 4, { width: cw.sale - 8, align: "right" }); cx += cw.sale;
      doc.text("Qty",                         cx + 4, y + 4, { width: cw.qty - 8,  align: "right" });  cx += cw.qty;
      doc.text("Total",                       cx + 4, y + 4, { width: cw.total - 8,align: "right" });

      y += h + rowGap;
      setBody(10);
    }

    function unitsForRow(row) {
      const L = Number(row.length_m || 0);
      const W = Number(row.width_m || 0);
      const area = Number(row.area_sqm || 0);
      const computedArea = (L > 0 && W > 0) ? (L * W) : 0;
      if (area > 0) return area;
      if (computedArea > 0) return computedArea;
      if (L > 0) return L;
      return 1;
    }

    function drawRow(row) {
      const pName = row.name ?? "";
      const sku   = row.sku ?? "";
      const sale  = Number(row.sale_price || 0);
      const qty   = Math.max(1, Number(row.qty || 1)); // match quotes page behavior
      const units = unitsForRow(row);

      // Quotes page line total logic
      const lineTotal = sale * qty * (units || 1);
      const salePerQty = lineTotal / qty; // what we display in "Unit Price" column

      // measure using Thai font
      setBody(10);
      const hName = doc.heightOfString(pName, { width: cw.product - 8, align: "left" });
      const hSku  = doc.heightOfString(sku,    { width: cw.sku - 8,     align: "left" });
      const cellH = Math.max(hName, hSku, 12) + rowPadV * 2;

      maybePageBreak(cellH);

      doc.rect(startX, y, contentWidth, cellH).fillOpacity(0.03).fill("#000000").fillOpacity(1);

      let cx = startX;

      setBody(10);
      doc.text(pName,                    cx + 4, y + rowPadV, { width: cw.product - 8, align: "left" });  cx += cw.product;
      doc.text(sku || "—",               cx + 4, y + rowPadV, { width: cw.sku - 8,     align: "left"  });  cx += cw.sku;
      doc.text(`$${money(salePerQty)}`,  cx + 4, y + rowPadV, { width: cw.sale - 8,    align: "right" });  cx += cw.sale;
      doc.text(String(qty),              cx + 4, y + rowPadV, { width: cw.qty - 8,     align: "right" });  cx += cw.qty;
      doc.text(`$${money(lineTotal)}`,   cx + 4, y + rowPadV, { width: cw.total - 8,   align: "right" });

      y += cellH + rowGap;
      return lineTotal;
    }

    drawHeader();
    let subtotal = 0;
    for (const it of items) {
      subtotal += drawRow(it); // accumulate quotes-page line totals
    }

    const tCost = Number(quote.transportation_cost || 0);
    const finalTotal = subtotal + tCost;

    // Totals block: Subtotal, Transportation cost, Total
    maybePageBreak(54);
    setBody(10);
    doc.text(`Subtotal: $${money(subtotal)}`, startX, y, { align: "right", width: contentWidth }); y += 16;
    doc.text(`Transportation cost: $${money(tCost)}`, startX, y, { align: "right", width: contentWidth }); y += 18;
    setBold(12);
    doc.text(`Total: $${money(finalTotal)}`, startX, y, { align: "right", width: contentWidth });
    setBody(10);

    // Footer
    doc.moveDown(1);
    doc.text("Thank you for your business.");

    // End
    doc.end();

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${qno}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Failed to render PDF" },
      { status: 500 }
    );
  }
}
