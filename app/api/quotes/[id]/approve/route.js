import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(_req, { params }) {
  try {
    const id = Number(params.id);
    if (!(id > 0)) return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });

    // status -> approved; migration trigger inserts orders (one per item)
    await query(`UPDATE quotes SET status='approved', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id]);

    const jobs = await query(
      `SELECT o.id, o.job_number, o.status, o.quote_item_id
       FROM orders o
       WHERE o.quote_id = ?
       ORDER BY o.id ASC`, [id]
    );
    return NextResponse.json({ ok: true, jobs: jobs.rows || [] });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Approve failed" }, { status: 500 });
  }
}
