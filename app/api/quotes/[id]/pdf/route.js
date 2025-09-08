export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { PassThrough } from "stream";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });
const money = (n) => (Number(n) || 0).toFixed(2);

async function getCols(table) {
  const r = await query(`PRAGMA table_info(${table})`);
  const names = new Set((r.rows || []).map(x => x.name));
  return { has: (c) => names.has(c) };
}

export async function GET(_req, { params }) {
  try {
    const { id } = await params;              // Next 15: await params
    const qid = Number(id);
    if (!Number.isFinite(qid)) return jerr("invalid quote id");

    // Quote header
    const q = await query(
      `SELECT id, quote_number, COALESCE(status,'draft') AS status, created_at
       FROM quotes WHERE id = ? LIMIT 1`,
      [qid]
    );
    if (!q.rows?.length) return jerr("quote not found", 404);
    const quote = q.rows[0];

    // Items (be defensive about columns that may not exist)
    const pcols = await getCols("products");
    const qic   = await getCols("quote_items");

    const skuSel   = pcols.has("sku") ? "p.sku" : "NULL AS sku";
    const nameSel  = pcols.has("name") ? "p.name" : "CAST(p.id AS TEXT) AS name";
    const saleSel  = qic.has("sale_price") ? "qi.sale_price" : (qic.has("price") ? "qi.price" : "0");
    const costSel  = qic.has("cost_price") ? "qi.cost_price" : (qic.has("cost") ? "qi.cost" : "0");

    const itemsRes = await query(
      `SELECT
         ${nameSel},
         ${skuSel},
         qi.qty,
         COALESCE(${saleSel},0) AS sale_price,
         COALESCE(${costSel},0) AS cost_price
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

    // Title
    doc.font("Helvetica-Bold").fontSize(18).text("Quote", { align: "left" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10);
    const qno = quote.quote_number || `QUO-${String(quote.id).padStart(6, "0")}`;
    doc.text(`Quote #: ${qno}`);
    doc.text(`Status: ${quote.status}`);
    if (quote.created_at) doc.text(`Created: ${quote.created_at}`);
    doc.moveDown(0.8);

    // Table layout
    const pageWidth = doc.page.width;
    const { left, right, top, bottom } = doc.page.margins;
    const contentWidth = pageWidth - left - right;
    const startX = left;
    let y = doc.y;

    // Column widths (sum <= 1.0). Adjust if you need different proportions.
    const cols = {
      product: 0.35,
      sku:     0.12,
      cost:    0.10,
      markup:  0.11,
      sale:    0.10,
      qty:     0.10, // small, but right-aligned
      // line total will be derived (sale * qty) and shown under "Total"
      total:   0.10,
    };

    // Convert to pixel widths
    const cw = {};
    Object.keys(cols).forEach(k => cw[k] = Math.floor(cols[k] * contentWidth));

    const headerHeight = 18;
    const rowPadV = 4;
    const rowGap = 2;

    function maybePageBreak(neededHeight) {
      const maxY = doc.page.height - bottom;
      if (y + neededHeight > maxY) {
        doc.addPage();
        y = top;
        drawHeader(); // redraw header on new page
      }
    }

    function drawHeader() {
      doc.font("Helvetica-Bold").fontSize(10);
      const x = startX;
      let cx = x;
      const h = headerHeight;

      doc.rect(startX, y, contentWidth, h).fillOpacity(0.05).fill("#000000").fillOpacity(1);

      doc
        .fillColor("#000")
        .text("Product", cx + 4, y + 4, { width: cw.product - 8 }); cx += cw.product;
      doc.text("SKU",     cx + 4, y + 4, { width: cw.sku - 8 });     cx += cw.sku;
      doc.text("Cost",    cx + 4, y + 4, { width: cw.cost - 8, align: "right" });   cx += cw.cost;
      doc.text("Markup %",cx + 4, y + 4, { width: cw.markup - 8, align: "right" }); cx += cw.markup;
      doc.text("Sale",    cx + 4, y + 4, { width: cw.sale - 8, align: "right" });   cx += cw.sale;
      doc.text("Qty",     cx + 4, y + 4, { width: cw.qty - 8, align: "right" });    cx += cw.qty;
      doc.text("Total",   cx + 4, y + 4, { width: cw.total - 8, align: "right" });

      y += h + rowGap;
      doc.font("Helvetica").fontSize(10);
    }

    function drawRow(row) {
      // Compute each cell's height so the row height is max
      const pName = row.name ?? "";
      const sku = row.sku ?? "";
      const cost = Number(row.cost_price || 0);
      const sale = Number(row.sale_price || 0);
      const qty  = Number(row.qty || 0);
      const total = sale * qty;

      const hName = doc.heightOfString(pName, { width: cw.product - 8, align: "left" });
      const hSku  = doc.heightOfString(sku,    { width: cw.sku - 8,     align: "left" });
      const cellH = Math.max(hName, hSku, 12) + rowPadV * 2;

      maybePageBreak(cellH);

      // Background stripes (optional)
      doc.rect(startX, y, contentWidth, cellH).fillOpacity(0.03).fill("#000000").fillOpacity(1);

      // Draw cells
      let cx = startX;

      doc.fillColor("#000").text(pName, cx + 4, y + rowPadV, {
        width: cw.product - 8,
        align: "left",
      }); cx += cw.product;

      doc.text(sku || "—", cx + 4, y + rowPadV, {
        width: cw.sku - 8,
        align: "left",
      }); cx += cw.sku;

      doc.text(`$${money(cost)}`, cx + 4, y + rowPadV, {
        width: cw.cost - 8,
        align: "right",
      }); cx += cw.cost;

      // Markup % = derived from cost/sale (display only)
      const markupPct = cost > 0 ? ((sale - cost) / cost) * 100 : 0;
      doc.text(`${markupPct.toFixed(1)}%`, cx + 4, y + rowPadV, {
        width: cw.markup - 8,
        align: "right",
      }); cx += cw.markup;

      doc.text(`$${money(sale)}`, cx + 4, y + rowPadV, {
        width: cw.sale - 8,
        align: "right",
      }); cx += cw.sale;

      doc.text(String(qty), cx + 4, y + rowPadV, {
        width: cw.qty - 8,
        align: "right",
      }); cx += cw.qty;

      doc.text(`$${money(total)}`, cx + 4, y + rowPadV, {
        width: cw.total - 8,
        align: "right",
      });

      y += cellH + rowGap;
    }

    drawHeader();
    let grand = 0;
    for (const it of items) {
      drawRow(it);
      grand += Number(it.sale_price || 0) * Number(it.qty || 0);
    }

    // Totals
    maybePageBreak(30);
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text(`Total: $${money(grand)}`, startX, y, { align: "right", width: contentWidth });
    doc.font("Helvetica").fontSize(10);

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
