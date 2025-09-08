// app/api/quotes/[id]/accept/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(_req, { params }) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
    }

    // Mark accepted (0010 trigger will auto-create an order if none exists)
    await query(
      `UPDATE quotes
          SET status='accepted',
              updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
      [id]
    );

    // Safety: ensure there is at least one order for this quote
    await query(
      `INSERT OR IGNORE INTO orders (quote_id, status, created_at, updated_at)
       VALUES (?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id]
    );

    // Return the latest order (with job_number)
    const r = await query(
      `SELECT o.id, o.job_number, o.status, o.created_at, o.updated_at,
              q.quote_number
         FROM orders o
         JOIN quotes q ON q.id = o.quote_id
        WHERE o.quote_id = ?
        ORDER BY o.id DESC
        LIMIT 1`,
      [id]
    );

    if (!r.rows?.length) {
      return NextResponse.json({ error: "Failed to create order for quote" }, { status: 500 });
    }
    return NextResponse.json(r.rows[0]);
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Accept failed" }, { status: 500 });
  }
}
