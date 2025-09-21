// app/api/orders/[id]/materials/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });

/** GET /api/orders/[id]/materials — list materials allocated to this job (by job_number), 1 row per material */
export async function GET(_req, context) {
  const { id } = await context.params; // Next 15: await params
  const oid = Number(id);
  if (!Number.isFinite(oid)) return jerr("invalid order id");

  // Look up this order's job_number + status
  const jr = await query(`SELECT job_number, status FROM orders WHERE id = ? LIMIT 1`, [oid]);
  if (!jr.rows?.length) return jerr("order not found", 404);

  const job = jr.rows[0].job_number;
  const isComplete = String(jr.rows[0].status || "").toLowerCase() === "complete";
  if (!job) return NextResponse.json([]); // nothing allocated if no job_number yet

  // ===== Preferred paths (grouped by material so same material shows as one line) =====
  try {
    if (isComplete) {
      // Completed → show consumed allocations, merged per material
      const r = await query(
        `
        SELECT
          -- stable id per material row
          ca.material_id                         AS id,
          ca.material_id                         AS material_id,
          ca.job_number                          AS job_number,
          SUM(COALESCE(ca.qty,0))                AS qty,
          COALESCE(MAX(ca.unit_cost), m.cost_price, 0) AS unit_cost,
          MAX(ca.created_at)                     AS created_at,
          NULL                                   AS consumed_at,
          m.name                                 AS material_name,
          m.sku                                  AS sku,
          m.unit                                 AS unit
        FROM consumed_allocations ca
        JOIN materials m ON m.id = ca.material_id
        WHERE ca.job_number = ?
        GROUP BY ca.material_id, ca.job_number
        ORDER BY material_name ASC
        `,
        [job]
      );
      return NextResponse.json(r.rows || []);
    }

    // Not complete → show WIP allocations, merged per material
    const r = await query(
      `
      SELECT
        wa.material_id                           AS id,
        wa.material_id                           AS material_id,
        wa.job_number                            AS job_number,
        SUM(COALESCE(wa.qty,0))                  AS qty,
        COALESCE(MAX(wa.unit_cost), m.cost_price, 0) AS unit_cost,
        MAX(wa.created_at)                       AS created_at,
        NULL                                     AS consumed_at,
        m.name                                   AS material_name,
        m.sku                                    AS sku,
        m.unit                                   AS unit
      FROM wip_allocations wa
      JOIN materials m ON m.id = wa.material_id
      WHERE wa.job_number = ?
      GROUP BY wa.material_id, wa.job_number
      ORDER BY material_name ASC
      `,
      [job]
    );
    return NextResponse.json(r.rows || []);
  } catch (e) {
    // ===== Fallbacks =====
    // If consumed_allocations or columns missing, fall back to plain WIP (grouped)
    try {
      const r2 = await query(
        `
        SELECT
          wa.material_id                           AS id,
          wa.material_id                           AS material_id,
          wa.job_number                            AS job_number,
          SUM(COALESCE(wa.qty,0))                  AS qty,
          COALESCE(MAX(wa.unit_cost), m.cost_price, 0) AS unit_cost,
          MAX(wa.created_at)                       AS created_at,
          NULL                                     AS consumed_at,
          m.name                                   AS material_name,
          m.sku                                    AS sku,
          m.unit                                   AS unit
        FROM wip_allocations wa
        JOIN materials m ON m.id = wa.material_id
        WHERE wa.job_number = ?
        GROUP BY wa.material_id, wa.job_number
        ORDER BY material_name ASC
        `,
        [job]
      );
      return NextResponse.json(r2.rows || []);
    } catch (e2) {
      // Final super-safe fallback if created_at missing (no grouping available → still aggregate via rowid)
      const r3 = await query(
        `
        SELECT
          wa.rowid                                 AS id,
          wa.material_id                           AS material_id,
          wa.job_number                            AS job_number,
          COALESCE(wa.qty,0)                       AS qty,
          COALESCE(wa.unit_cost, m.cost_price, 0)  AS unit_cost,
          NULL                                     AS created_at,
          NULL                                     AS consumed_at,
          m.name                                   AS material_name,
          m.sku                                    AS sku,
          m.unit                                   AS unit
        FROM wip_allocations wa
        JOIN materials m ON m.id = wa.material_id
        WHERE wa.job_number = ?
        ORDER BY wa.rowid DESC
        `,
        [job]
      );
      return NextResponse.json(r3.rows || []);
    }
  }
}
