import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (msg, code = 400, extra = {}) =>
  NextResponse.json({ error: msg, ...extra }, { status: code });

export async function POST(req) {
  try {
    const { id, qty, job_number, jobNumber } = await req.json();

    if (!id && id !== 0) return jerr("id is required");
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return jerr("qty must be a positive number");

    const job = String(job_number ?? jobNumber ?? "").trim();
    if (!job) return jerr("job_number is required");

    const idStr = String(id);

    // 1) Ensure order/job exists
    const ord = await query(`SELECT id FROM orders WHERE job_number = ? LIMIT 1`, [job]);
    if (!ord.rows?.length) return jerr(`Order/job not found (job_number=${job})`, 404);

    // 2) Ensure material exists and get current unallocated & cost
    const cur = await query(
      `SELECT id AS mid, COALESCE(unallocated_stock,0) AS unalloc, COALESCE(cost_price,NULL) AS cost_price
         FROM materials
        WHERE CAST(id AS TEXT) = ?
        LIMIT 1`,
      [idStr]
    );
    if (!cur.rows?.length) return jerr(`Material not found (id=${idStr})`, 404);

    const materialId = cur.rows[0].mid; // use as-is (now integers after your normalization)
    const unalloc = Number(cur.rows[0].unalloc) || 0;
    const unitCost = cur.rows[0].cost_price == null ? null : Number(cur.rows[0].cost_price);
    if (n > unalloc) return jerr(`Insufficient unallocated stock (have ${unalloc}, need ${n})`, 409);

    // 3) Move Unallocated → WIP (guard against negative), and record allocation per job
    await query(
      `UPDATE materials
          SET unallocated_stock = COALESCE(unallocated_stock,0) - ?,
              wip_qty           = COALESCE(wip_qty,0) + ?,
              updated_at        = CURRENT_TIMESTAMP
        WHERE CAST(id AS TEXT) = ?
          AND COALESCE(unallocated_stock,0) >= ?`,
      [n, n, idStr, n]
    );

    await query(
      `INSERT INTO wip_allocations(material_id, job_number, qty, unit_cost)
       VALUES (?, ?, ?, ?)`,
      [materialId, job, n, unitCost]
    );

    // 4) Return the updated material (prefer the view)
    try {
      const v = await query(
        `SELECT id, name, sku, unit, cost_price,
                unallocated_stock, wip_qty, stock_qty, created_at, updated_at
           FROM materials_with_totals
          WHERE CAST(id AS TEXT) = ?
          LIMIT 1`,
        [idStr]
      );
      if (v.rows?.length) return NextResponse.json(v.rows[0]);
    } catch {}

    const b = await query(
      `SELECT id, name, sku, unit,
              COALESCE(cost_price,0)        AS cost_price,
              COALESCE(unallocated_stock,0) AS unallocated_stock,
              COALESCE(wip_qty,0)           AS wip_qty,
              (COALESCE(unallocated_stock,0)+COALESCE(wip_qty,0)) AS stock_qty,
              created_at, updated_at
         FROM materials
        WHERE CAST(id AS TEXT) = ?
        LIMIT 1`,
      [idStr]
    );
    return NextResponse.json(b.rows?.[0] ?? null);
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Transfer failed" }, { status: 500 });
  }
}
