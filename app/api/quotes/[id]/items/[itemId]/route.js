// app/api/quotes/[id]/items/[itemId]/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (m, s=400) => NextResponse.json({ error: m }, { status: s });

async function recalcQuoteTotals(qid) {
  // billable = qty * (area_sqm or length_m*width_m or length_m or 1)
  const sums = await query(
    `SELECT
       COALESCE(
         SUM(
           COALESCE(cost_price,0) * COALESCE(qty,1) *
           COALESCE(
             NULLIF(area_sqm,0),
             COALESCE(NULLIF(length_m * width_m,0),
                      COALESCE(NULLIF(length_m,0), 1)
             )
           )
         ), 0
       ) AS subtotal_cost,
       COALESCE(
         SUM(
           COALESCE(sale_price,0) * COALESCE(qty,1) *
           COALESCE(
             NULLIF(area_sqm,0),
             COALESCE(NULLIF(length_m * width_m,0),
                      COALESCE(NULLIF(length_m,0), 1)
             )
           )
         ), 0
       ) AS total_price
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

// Update one item (qty, sale_price, length_m, width_m, area_sqm)
export async function PATCH(req, { params }) {
  const { id, itemId } = await params;
  const qid = Number(id);
  const iid = Number(itemId);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");
  if (!Number.isFinite(iid)) return jerr("invalid item id");

  const patch = await req.json().catch(() => ({}));

  const fields = [];
  const vals = [];

  // qty
  if (patch.qty != null) {
    const n = Number(patch.qty);
    if (!(Number.isFinite(n) && n > 0)) return jerr("qty must be > 0");
    fields.push("qty = ?");
    vals.push(n);
  }

  // sale_price
  if (patch.sale_price != null) {
    const sp = Number(patch.sale_price);
    if (!Number.isFinite(sp) || sp < 0) return jerr("invalid sale_price");
    fields.push("sale_price = ?");
    vals.push(sp);
  }

  // length_m
  const lenProvided = patch.length_m !== undefined;
  if (lenProvided) {
    const L = Number(patch.length_m);
    fields.push("length_m = ?");
    vals.push(Number.isFinite(L) && L >= 0 ? L : null);
  }

  // width_m
  const widProvided = patch.width_m !== undefined;
  if (widProvided) {
    const W = Number(patch.width_m);
    fields.push("width_m = ?");
    vals.push(Number.isFinite(W) && W >= 0 ? W : null);
  }

  // area_sqm (explicit)
  const areaProvided = patch.area_sqm !== undefined;
  if (areaProvided) {
    const A = Number(patch.area_sqm);
    fields.push("area_sqm = ?");
    vals.push(Number.isFinite(A) && A >= 0 ? A : null);
  }

  // If no fields at all, bail early
  if (!fields.length) return jerr("no fields to update");

  // If caller changed length and/or width but did NOT explicitly provide area,
  // compute area_sqm from the *resulting* dimensions (patched + current).
  if (!areaProvided && (lenProvided || widProvided)) {
    const cur = await query(
      `SELECT length_m, width_m FROM quote_items WHERE quote_id = ? AND id = ? LIMIT 1`,
      [qid, iid]
    );
    const curLen = Number(cur.rows?.[0]?.length_m ?? 0);
    const curWid = Number(cur.rows?.[0]?.width_m ?? 0);

    const effLen = lenProvided ? Number(patch.length_m) || 0 : curLen || 0;
    const effWid = widProvided ? Number(patch.width_m)  || 0 : curWid || 0;

    fields.push("area_sqm = ?");
    vals.push(effLen > 0 && effWid > 0 ? effLen * effWid : null);
  }

  // perform update
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
