// app/api/orders/jobs/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const openOnly = ["1", "true", "yes"].includes(
      (searchParams.get("open") || "").toLowerCase()
    );
    const limit = Math.min(Number(searchParams.get("limit") || 200), 500);

    const likeParams = q ? [`%${q}%`, `%${q}%`] : [];
    const whereParts = [];
    if (q) whereParts.push(`(COALESCE(o.job_number,'') LIKE ? OR CAST(o.id AS TEXT) LIKE ?)`);
    if (openOnly) whereParts.push(`LOWER(COALESCE(o.status,'')) IN ('open','in_progress')`);
    const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    // Try richer query (timestamps + join to quotes), then fall back if columns missing
    try {
      const sql = `
        SELECT
          o.id,
          COALESCE(o.job_number, printf('JOB-%06d', o.id)) AS job_number,
          o.status,
          o.quote_id,
          q.quote_number,
          q.customer,
          p.name AS product_name
        FROM orders o
        LEFT JOIN quotes q ON q.id = o.quote_id
        LEFT JOIN quote_items qi ON qi.id = o.quote_item_id
        LEFT JOIN products p ON p.id = qi.product_id
        ${where}
        ORDER BY o.updated_at DESC, o.created_at DESC, o.id DESC
        LIMIT ${limit}
      `;
      const r = await query(sql, likeParams);
      return NextResponse.json(r.rows || []);
    } catch (e) {
      const msg = String(e?.message || "");
      const missing = /no such column:\s*(updated_at|created_at|status|quote_number)/i.test(msg);
      if (!missing) throw e;

      const sql2 = `
        SELECT
          o.id,
          COALESCE(o.job_number, printf('JOB-%06d', o.id)) AS job_number,
          o.quote_id,
          NULL AS customer,
          NULL AS product_name
        FROM orders o
        ${q ? `WHERE (COALESCE(o.job_number,'') LIKE ? OR CAST(o.id AS TEXT) LIKE ?)` : ""}
        ORDER BY o.id DESC
        LIMIT ${limit}
      `;
      const r2 = await query(sql2, likeParams);
      return NextResponse.json(r2.rows || []);
    }
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to fetch jobs" }, { status: 500 });
  }
}
