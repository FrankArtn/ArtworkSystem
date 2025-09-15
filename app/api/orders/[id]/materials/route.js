// app/api/orders/[id]/materials/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });

/** GET /api/orders/[id]/materials — list materials allocated to this job (by job_number) */
export async function GET(_req, context) {
  const { id } = await context.params; // Next 15: await params
  const oid = Number(id);
  if (!Number.isFinite(oid)) return jerr("invalid order id");

  // Look up this order's job_number
  const jr = await query(`SELECT job_number FROM orders WHERE id = ? LIMIT 1`, [oid]);
  if (!jr.rows?.length) return jerr("order not found", 404);

  const job = jr.rows[0].job_number;
  if (!job) return NextResponse.json([]); // nothing allocated if no job_number yet

// Get allocations for this job_number (current WIP + consumed history, no dupes)
try {
  const r = await query(
    `SELECT
       wa.id,
       wa.material_id,
       wa.job_number,
       wa.qty,
       wa.unit_cost,
       wa.created_at,
       wa.consumed_at,             -- may be NULL if not consumed
       m.name AS material_name,
       m.sku,
       m.unit
     FROM wip_allocations wa
     JOIN materials m ON m.id = wa.material_id
     WHERE wa.job_number = ?

     UNION ALL

     SELECT
       ca.id + 1000000000 AS id,   -- keep keys unique vs wip ids
       ca.material_id,
       ca.job_number,
       ca.qty,
       ca.unit_cost,
       ca.created_at,
       NULL AS consumed_at,        -- archive has no consumed_at; adapt if you added archived_at
       m2.name AS material_name,
       m2.sku,
       m2.unit
     FROM consumed_allocations ca
     JOIN materials m2 ON m2.id = ca.material_id
     WHERE ca.job_number = ?
       AND NOT EXISTS (            -- avoid duplicates if you also keep rows in wip_allocations
         SELECT 1
         FROM wip_allocations w2
         WHERE w2.job_number = ca.job_number
           AND w2.material_id = ca.material_id
           AND COALESCE(w2.qty,0) = COALESCE(ca.qty,0)
           AND COALESCE(w2.unit_cost,0) = COALESCE(ca.unit_cost,0)
           AND COALESCE(w2.created_at,'') = COALESCE(ca.created_at,'')
       )
     ORDER BY COALESCE(created_at,'') DESC, id DESC`,
    [job, job]
  );
  return NextResponse.json(r.rows || []);
} catch (e) {
  // If consumed_allocations or consumed_at column doesn't exist yet, fall back to just WIP
  try {
    const r2 = await query(
      `SELECT
         wa.id,
         wa.material_id,
         wa.job_number,
         wa.qty,
         wa.unit_cost,
         wa.created_at,
         m.name AS material_name,
         m.sku,
         m.unit
       FROM wip_allocations wa
       JOIN materials m ON m.id = wa.material_id
       WHERE wa.job_number = ?
       ORDER BY COALESCE(wa.created_at,'') DESC, wa.id DESC`,
      [job]
    );
    return NextResponse.json(r2.rows || []);
  } catch (e2) {
    // Final super-safe fallback if created_at missing
    const r3 = await query(
      `SELECT
         wa.rowid AS id,
         wa.material_id,
         wa.job_number,
         wa.qty,
         wa.unit_cost,
         NULL AS created_at,
         m.name AS material_name,
         m.sku,
         m.unit
       FROM wip_allocations wa
       JOIN materials m ON m.id = wa.material_id
       WHERE wa.job_number = ?
       ORDER BY wa.rowid DESC`,
      [job]
    );
    return NextResponse.json(r3.rows || []);
    }
  }
}
