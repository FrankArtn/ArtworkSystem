// app/api/quotes/[id]/items/[itemId]/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (m, s=400) => NextResponse.json({ error: m }, { status: s });

async function recalcQuoteTotals(qid) {
  const sums = await query(
    `SELECT
       COALESCE(SUM(COALESCE(cost_price,0) * COALESCE(qty,0)),0) AS subtotal_cost,
       COALESCE(SUM(COALESCE(sale_price,0) * COALESCE(qty,0)),0) AS total_price
     FROM quote_items WHERE quote_id = ?`,
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

// Update one item (qty and/or sale_price)
export async function PATCH(req, { params }) {
  const { id, itemId } = await params;
  const qid = Number(id);
  const iid = Number(itemId);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");
  if (!Number.isFinite(iid)) return jerr("invalid item id");

  const patch = await req.json().catch(() => ({}));
  const fields = [];
  const vals = [];

  if (patch.qty != null) {
    const n = Number(patch.qty);
    if (!(Number.isFinite(n) && n > 0)) return jerr("qty must be > 0");
    fields.push("qty = ?");
    vals.push(n);
  }
  if (patch.sale_price != null) {
    const sp = Number(patch.sale_price);
    if (!Number.isFinite(sp) || sp < 0) return jerr("invalid sale_price");
    fields.push("sale_price = ?");
    vals.push(sp);
  }

  if (!fields.length) return jerr("no fields to update");

  vals.push(qid, iid);
  await query(
    `UPDATE quote_items
        SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE quote_id = ? AND id = ?`,
    vals
  );

  await recalcQuoteTotals(qid);
  return NextResponse.json({ ok: true });
}

// Delete one item
export async function DELETE(req, { params }) {
  const { id, itemId } = await params;
  const qid = Number(id);
  const iid = Number(itemId);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");
  if (!Number.isFinite(iid)) return jerr("invalid item id");

  await query(`DELETE FROM quote_items WHERE quote_id = ? AND id = ?`, [qid, iid]);
  await recalcQuoteTotals(qid);
  return NextResponse.json({ ok: true });
}
