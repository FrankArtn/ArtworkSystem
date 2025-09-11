// app/api/quotes/[id]/approve/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(_req, { params }) {
  try {
    const { id } = await params;           // ✅ await params
    const qid = Number(id);
    if (!Number.isFinite(qid) || qid <= 0) {
      return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
    }

    // Ensure the quote has items
    const items = await query(
      `SELECT id AS quote_item_id FROM quote_items WHERE quote_id = ?`,
      [qid]
    );
    if (!items.rows?.length) {
      return NextResponse.json({ error: "Quote has no items" }, { status: 400 });
    }

    // 1) Mark as approved
    await query(
      `UPDATE quotes
          SET status='approved',
              updated_at=CURRENT_TIMESTAMP
        WHERE id = ?`,
      [qid]
    );

    // 2) Create one order per quote item (idempotent if you add the unique index below)
    await query(
      `INSERT OR IGNORE INTO orders (quote_id, quote_item_id, status, created_at, updated_at)
       SELECT qi.quote_id, qi.id, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM quote_items qi
        WHERE qi.quote_id = ?`,
      [qid]
    );

    // 3) Ensure each order has a job_number (human-friendly)
    await query(
      `UPDATE orders
          SET job_number = printf('JOB-%06d', o.id),
              updated_at = CURRENT_TIMESTAMP
        FROM orders o
        WHERE o.quote_id = ? AND o.job_number IS NULL`,
      [qid]
    ).catch(async () => {
      // Fallback for SQLite dialects without UPDATE ... FROM
      await query(
        `UPDATE orders
            SET job_number = printf('JOB-%06d', id),
                updated_at = CURRENT_TIMESTAMP
          WHERE quote_id = ? AND job_number IS NULL`,
        [qid]
      );
    });

    // 4) Return all orders for this quote
    const jobs = await query(
      `SELECT o.id, o.job_number, o.status, o.quote_item_id
         FROM orders o
        WHERE o.quote_id = ?
        ORDER BY o.id ASC`,
      [qid]
    );

    return NextResponse.json({ ok: true, jobs: jobs.rows || [] });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Approve failed" }, { status: 500 });
  }
}
