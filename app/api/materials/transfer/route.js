// app/api/materials/transfer/route.js
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

    // 1) Ensure order/job exists (need status to decide path)
    const ord = await query(`SELECT id, status FROM orders WHERE job_number = ? LIMIT 1`, [job]);
    if (!ord.rows?.length) return jerr(`Order/job not found (job_number=${job})`, 404);
    const orderStatus = String(ord.rows[0].status || "").toLowerCase();

    // 2) Ensure material exists and get current pools + cost
    const cur = await query(
      `SELECT id AS mid,
              COALESCE(unallocated_stock,0) AS unalloc,
              COALESCE(wip_qty,0)           AS wip,
              COALESCE(used,0)              AS used,
              COALESCE(cost_price,NULL)     AS cost_price
         FROM materials
        WHERE CAST(id AS TEXT) = ?
        LIMIT 1`,
      [idStr]
    );
    if (!cur.rows?.length) return jerr(`Material not found (id=${idStr})`, 404);

    const materialId = cur.rows[0].mid; // integer id
    const unalloc = Number(cur.rows[0].unalloc) || 0;
    const used = Number(cur.rows[0].used) || 0;
    const unitCost = cur.rows[0].cost_price == null ? null : Number(cur.rows[0].cost_price);

    if (orderStatus === "complete") {
      // === COMPLETED ORDER ===
      // Deduct from USED first, then remainder from UNALLOCATED. No WIP changes, no wip_allocations changes.
      const takeFromUsed = Math.min(n, used);
      const remainder = n - takeFromUsed;

      if (remainder > unalloc) {
        return jerr(
          `Insufficient stock: available used=${used}, unallocated=${unalloc}, requested=${n}`,
          409
        );
      }

      // Update materials: used -= takeFromUsed; unallocated -= remainder
      await query(
        `UPDATE materials
            SET used               = MAX(0, COALESCE(used,0) - ?),
                unallocated_stock  = COALESCE(unallocated_stock,0) - ?,
                updated_at         = CURRENT_TIMESTAMP
          WHERE CAST(id AS TEXT) = ?
            AND COALESCE(unallocated_stock,0) >= ?`,
        [takeFromUsed, remainder, idStr, remainder]
      );

      // Upsert into consumed_allocations so the job table reflects the change
     const ex = await query(
       `SELECT id, qty
          FROM consumed_allocations
         WHERE material_id = ? AND job_number = ?
         LIMIT 1`,
       [materialId, job]
     );
     if (ex.rows?.length) {
       await query(
         `UPDATE consumed_allocations
             SET qty = COALESCE(qty,0) + ?,
                 unit_cost = COALESCE(unit_cost, ?)
           WHERE id = ?`,
         [n, unitCost, ex.rows[0].id]
       );
     } else {
       await query(
         `INSERT INTO consumed_allocations(material_id, job_number, qty, unit_cost)
          VALUES (?, ?, ?, ?)`,
         [materialId, job, n, unitCost]
       );
     }

      // Done (no WIP).
    } else {
      // === OPEN / IN_PROGRESS (not complete) ===
      // 1) Use as much as possible from USED -> move that portion into WIP
      const takeFromUsed = Math.min(n, used);
      const remainder = n - takeFromUsed;

      // If remainder needed, ensure unallocated can cover it
      if (remainder > unalloc) {
        return jerr(
          `Insufficient stock: available used=${used}, unallocated=${unalloc}, requested=${n}`,
          409
        );
      }

      // a) Move from USED -> WIP
      if (takeFromUsed > 0) {
        await query(
          `UPDATE materials
              SET used       = MAX(0, COALESCE(used,0) - ?),
                  wip_qty    = COALESCE(wip_qty,0) + ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE CAST(id AS TEXT) = ?`,
          [takeFromUsed, takeFromUsed, idStr]
        );
      }

      // b) Move remainder from UNALLOCATED -> WIP
      if (remainder > 0) {
        await query(
          `UPDATE materials
              SET unallocated_stock = COALESCE(unallocated_stock,0) - ?,
                  wip_qty           = COALESCE(wip_qty,0) + ?,
                  updated_at        = CURRENT_TIMESTAMP
            WHERE CAST(id AS TEXT) = ?
              AND COALESCE(unallocated_stock,0) >= ?`,
          [remainder, remainder, idStr, remainder]
        );
      }

      // c) UPSERT a single allocation row for this material+job (increase qty if it exists)
      const existing = await query(
        `SELECT id, qty, unit_cost
           FROM wip_allocations
          WHERE material_id = ? AND job_number = ?
          LIMIT 1`,
        [materialId, job]
      );
      if (existing.rows?.length) {
        const alloc = existing.rows[0];
        // Keep existing unit_cost unless it's NULL, then set to material cost
        await query(
          `UPDATE wip_allocations
              SET qty = COALESCE(qty,0) + ?,
                  unit_cost = COALESCE(unit_cost, ?)
            WHERE id = ?`,
          [n, unitCost, alloc.id]
        );
      } else {
        await query(
          `INSERT INTO wip_allocations(material_id, job_number, qty, unit_cost)
           VALUES (?, ?, ?, ?)`,
          [materialId, job, n, unitCost]
        );
      }
    }

    // 3) Return the updated material (prefer the view)
    try {
      const v = await query(
        `SELECT id, name, sku, unit, cost_price,
                unallocated_stock, wip_qty, used, stock_qty,
                created_at, updated_at
           FROM materials_with_totals
          WHERE CAST(id AS TEXT) = ?
          LIMIT 1`,
        [idStr]
      );
      if (v.rows?.length) return NextResponse.json(v.rows[0]);
    } catch (e) {
      // ignore, fallback below
    }

    // Fallback to base table (stock_qty = unallocated + wip + used)
    const b = await query(
      `SELECT id, name, sku, unit,
              COALESCE(cost_price,0)        AS cost_price,
              COALESCE(unallocated_stock,0) AS unallocated_stock,
              COALESCE(wip_qty,0)           AS wip_qty,
              COALESCE(used,0)              AS used,
              (COALESCE(unallocated_stock,0)+COALESCE(wip_qty,0)+COALESCE(used,0)) AS stock_qty,
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
