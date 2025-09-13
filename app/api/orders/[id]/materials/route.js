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

  // Get allocations for this job_number
  try {
    const r = await query(
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
       ORDER BY wa.created_at DESC, wa.id DESC`,
      [job]
    );
    return NextResponse.json(r.rows || []);
  } catch (e) {
    // Fallback if created_at doesn't exist
    const r2 = await query(
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
    return NextResponse.json(r2.rows || []);
  }
}
