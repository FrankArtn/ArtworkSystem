// app/api/quotes/[id]/items/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });

// Recalculate and persist quote totals from canonical columns
async function recalcQuoteTotals(qid) {
  const sums = await query(
    `SELECT
       COALESCE(SUM(COALESCE(cost_price,0) * COALESCE(qty,0)),0) AS subtotal_cost,
       COALESCE(SUM(COALESCE(sale_price,0) * COALESCE(qty,0)),0) AS total_price
     FROM quote_items
     WHERE quote_id = ?`,
    [qid]
  );
  const sc = Number(sums.rows?.[0]?.subtotal_cost ?? 0);
  const tp = Number(sums.rows?.[0]?.total_price ?? 0);
  const mp = sc > 0 ? ((tp - sc) / sc) * 100 : 0;

  await query(
    `UPDATE quotes
       SET subtotal_cost = ?, total_price = ?, markup_pct = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [sc, tp, mp, qid]
  );
}

export async function GET(_req, { params }) {
  const { id } = await params; // Next 15: await params
  const qid = Number(id);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");

  // Be defensive about products.sku possibly not existing
  const pInfo = await query(`PRAGMA table_info(products)`);
  const pCols = new Set((pInfo.rows || []).map(r => r.name));
  const hasSku = pCols.has("sku");

  const r = await query(
    `
    SELECT
      qi.id, qi.quote_id, qi.product_id, qi.qty,
      COALESCE(qi.sale_price,0) AS sale_price,
      COALESCE(qi.cost_price,0) AS cost_price,
      p.name AS product_name,
      ${hasSku ? "p.sku" : "NULL AS sku"}
    FROM quote_items qi
    JOIN products p ON p.id = qi.product_id
    WHERE qi.quote_id = ?
    ORDER BY qi.id DESC
    `,
    [qid]
  );

  return NextResponse.json(r.rows || []);
}

export async function POST(req, { params }) {
  const { id } = await params; // Next 15: await params
  const qid = Number(id);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");

  const body = await req.json().catch(() => ({}));
  const productId = Number(body.product_id);
  const qty = Number(body.qty);
  const overrideSale = body.sale_price != null ? Number(body.sale_price) : null;
  const markupPct = body.markup_pct != null ? Number(body.markup_pct) : null;

  if (!Number.isFinite(productId) || productId <= 0) return jerr("product_id required");
  if (!Number.isFinite(qty) || qty <= 0) return jerr("qty must be > 0");

  // Introspect products columns so we don't reference missing columns
  const info = await query(`PRAGMA table_info(products)`);
  const names = new Set((info.rows || []).map(r => r.name));
  const hasCostPrice = names.has("cost_price");
  const hasBaseSetup = names.has("base_setup_cost");

  // Build a safe selector for cost:  cost_price → base_setup_cost → 0
  const costSel =
    hasCostPrice && hasBaseSetup
      ? "COALESCE(cost_price, base_setup_cost, 0)"
      : hasCostPrice
        ? "COALESCE(cost_price, 0)"
        : hasBaseSetup
          ? "COALESCE(base_setup_cost, 0)"
          : "0";

  // Now safely read base cost
  const pr = await query(
    `SELECT ${costSel} AS base_cost FROM products WHERE id = ? LIMIT 1`,
    [productId] // NOTE: must be an array, not an object
  );
  if (!pr.rows?.length) return jerr("product not found", 404);

  const baseCost = Number(pr.rows[0].base_cost) || 0;

  const cost_price = baseCost;
  const sale_price =
    overrideSale != null && Number.isFinite(overrideSale)
      ? overrideSale
      : (Number.isFinite(markupPct)
          ? Math.round(baseCost * (1 + markupPct / 100) * 100) / 100
          : 0);

  // Insert — include timestamps only if they exist
  const qiInfo = await query(`PRAGMA table_info(quote_items)`);
  const qiCols = new Set((qiInfo.rows || []).map(r => r.name));

  const cols = ["quote_id", "product_id", "qty", "cost_price", "sale_price"];
  const ph   = ["?", "?", "?", "?", "?"];
  const vals = [qid, productId, qty, cost_price, sale_price];

  if (qiCols.has("created_at")) { cols.push("created_at"); ph.push("CURRENT_TIMESTAMP"); }
  if (qiCols.has("updated_at")) { cols.push("updated_at"); ph.push("CURRENT_TIMESTAMP"); }

  await query(
    `INSERT INTO quote_items (${cols.join(", ")}) VALUES (${ph.join(", ")})`,
    vals
  );

  await recalcQuoteTotals(qid);

  const r = await query(`SELECT id FROM quote_items WHERE rowid = last_insert_rowid() LIMIT 1`);
  return NextResponse.json(r.rows?.[0] ?? null, { status: 201 });
}
