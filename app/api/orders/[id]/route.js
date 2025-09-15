// app/api/orders/[id]/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });
export const dynamic = "force-dynamic";

/** GET /api/orders/[id] — return a single job order (with quote + product context if available) */
export async function GET(_req, context) {
  const { id } = await context.params; // Next 15: await params
  const oid = Number(id);
  if (!Number.isFinite(oid)) return jerr("invalid order id");

  try {
    // NOTE: removed p.sku because your products table doesn't have it
    const r = await query(
      `SELECT
         o.id,
         COALESCE(o.job_number, printf('JOB-%06d', o.id)) AS job_number,
         COALESCE(o.status, 'open') AS status,
         o.quote_id,
         q.quote_number,
         q.customer,
         o.quote_item_id,
         qi.qty AS qty,
         p.name AS product_name,
         o.completed_at,
         o.created_at,
         o.updated_at
       FROM orders o
       LEFT JOIN quotes q       ON q.id  = o.quote_id
       LEFT JOIN quote_items qi ON qi.id = o.quote_item_id
       LEFT JOIN products p     ON p.id  = qi.product_id
       WHERE o.id = ?
       LIMIT 1`,
      [oid]
    );

    const row = r.rows?.[0];
    if (!row) return jerr("order not found", 404);

    // Fallback for legacy orders (no quote_item_id) → return all items from the quote
    if ((!row.product_name || row.quote_item_id == null) && row.quote_id) {
      const itemsRes = await query(
        `SELECT
           p.name AS product_name,
           qi.qty AS qty
         FROM quote_items qi
         JOIN products p ON p.id = qi.product_id
         WHERE qi.quote_id = ?
         ORDER BY qi.id ASC`,
        [row.quote_id]
      );
      row.items = itemsRes.rows || [];
    }

    return NextResponse.json(row);
  } catch (e) {
    // Minimal fallback if some columns/tables are missing, but still try to attach items[]
    const r2 = await query(
      `SELECT
         o.id,
         COALESCE(o.job_number, printf('JOB-%06d', o.id)) AS job_number,
         COALESCE(o.status, 'open') AS status,
         o.quote_id,
         o.quote_item_id
       FROM orders o
       WHERE o.id = ?
       LIMIT 1`,
      [oid]
    );
    const row2 = r2.rows?.[0];
    if (!row2) return jerr("order not found", 404);

    if (row2.quote_id) {
      try {
        const itemsRes = await query(
          `SELECT
             p.name AS product_name,
             qi.qty AS qty
           FROM quote_items qi
           JOIN products p ON p.id = qi.product_id
           WHERE qi.quote_id = ?
           ORDER BY qi.id ASC`,
          [row2.quote_id]
        );
        row2.items = itemsRes.rows || [];
      } catch {}
    }

    return NextResponse.json(row2);
  }
}

/** PATCH /api/orders/[id] — allow status/job_number updates; returns the same shape as GET */
export async function PATCH(req, context) {
  const { id } = await context.params; // Next 15: await params
  const oid = Number(id);
  if (!Number.isFinite(oid)) return jerr("invalid order id");

  const body = await req.json().catch(() => ({}));

  const updates = [];
  const values = [];

  // Strict allow-list for status
  if (typeof body.status === "string") {
    const status = body.status.trim().toLowerCase();
    const allowed = new Set(["open", "in_progress", "complete", "closed", "cancelled"]);
    if (!allowed.has(status)) return jerr("unsupported status");

    updates.push("status = ?");
    values.push(status);

    // Auto-set completed_at when closing
    if (status === "complete" || status === "closed") {
      updates.push("completed_at = CURRENT_TIMESTAMP");
    }
  }

  // Optional: override/assign a human job number
  if (typeof body.job_number === "string") {
    const jn = body.job_number.trim();
    updates.push("job_number = ?");
    values.push(jn === "" ? null : jn);
  }

  if (updates.length === 0) return jerr("no supported fields to update");

  const sql = `
    UPDATE orders
       SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`;
  values.push(oid);

  const r = await query(sql, values);
  if (!r || r.rowsAffected === 0) return jerr("order not found", 404);

  // Re-read using the same rich query as GET (no p.sku)
  const out = await query(
    `SELECT
       o.id,
       COALESCE(o.job_number, printf('JOB-%06d', o.id)) AS job_number,
       COALESCE(o.status, 'open') AS status,
       o.quote_id,
       q.quote_number,
       q.customer,
       o.quote_item_id,
       qi.qty AS qty,
       p.name AS product_name,
       o.completed_at,
       o.created_at,
       o.updated_at
     FROM orders o
     LEFT JOIN quotes q       ON q.id  = o.quote_id
     LEFT JOIN quote_items qi ON qi.id = o.quote_item_id
     LEFT JOIN products p     ON p.id  = qi.product_id
     WHERE o.id = ?
     LIMIT 1`,
    [oid]
  );

  const row = out.rows?.[0] ?? null;

    // ✅ When a job is completed/closed, consume its WIP allocations (but keep a history):
  if (row && (String(row.status).toLowerCase() === 'complete' || String(row.status).toLowerCase() === 'closed')) {
    try {
      // Get this job's number
      const jr = await query(`SELECT job_number FROM orders WHERE id = ? LIMIT 1`, [oid]);
      const jobNum = jr.rows?.[0]?.job_number;
      if (jobNum) {
        // 1) Sum allocations by material for this job
        const sums = await query(
          `SELECT material_id, SUM(COALESCE(qty,0)) AS qty
            FROM wip_allocations
            WHERE job_number = ?
            GROUP BY material_id`,
          [jobNum]
        );

        // 2) For each material, reduce wip_qty (guard against negative)
        for (const s of (sums.rows || [])) {
          const mid = s.material_id;
          const useQty = Number(s.qty || 0);
          if (!mid || !(useQty > 0)) continue;

          await query(
            `UPDATE materials
                SET wip_qty    = CASE
                                  WHEN COALESCE(wip_qty,0) >= ?
                                  THEN COALESCE(wip_qty,0) - ?
                                  ELSE 0
                                END,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [useQty, useQty, mid]
          );
        }

       // 3) Mark allocations as consumed (keep rows so the job page can still show them)
      try {
        // Ensure a consumed_at column exists on wip_allocations
        try {
          const info = await query(`PRAGMA table_info(wip_allocations)`);
          const hasConsumedAt = (info.rows || []).some(
            c => String(c.name).toLowerCase() === 'consumed_at'
          );
          if (!hasConsumedAt) {
            await query(`ALTER TABLE wip_allocations ADD COLUMN consumed_at TEXT`);
          }
        } catch (_) {
          // ignore if PRAGMA/ALTER fails (SQLite variants differ)
        }

        // (Optional) keep your archive table for history analytics
        try {
          await query(`
            CREATE TABLE IF NOT EXISTS consumed_allocations (
              id           INTEGER PRIMARY KEY AUTOINCREMENT,
              material_id  INTEGER NOT NULL,
              job_number   TEXT    NOT NULL,
              qty          REAL    NOT NULL,
              unit_cost    REAL,
              created_at   TEXT,
              archived_at  TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Copy from WIP to archive (preserve original created_at)
          await query(
            `INSERT INTO consumed_allocations (material_id, job_number, qty, unit_cost, created_at)
              SELECT material_id, job_number, qty, unit_cost, created_at
                FROM wip_allocations
                WHERE job_number = ?`,
            [jobNum]
          );
        } catch (_) {
          // best-effort; non-fatal
        }

        // ✅ Instead of DELETE, stamp consumed_at so the rows remain visible on the job page
        await query(
          `UPDATE wip_allocations
              SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP)
            WHERE job_number = ?`,
          [jobNum]
        );
        } catch (_) {
          // best-effort; don't block the response if this fails
        }
      }
    } catch (e) {
      // best-effort; don't fail the PATCH if inventory ops hit a missing table/column
      const msg = String(e?.message || "");
      const ignorable =
        /no such table:\s*wip_allocations/i.test(msg) ||
        /no such table:\s*materials/i.test(msg) ||
        /no such column:/i.test(msg);
      if (!ignorable) {
        // console.error("consume WIP on complete failed:", e);
      }
    }
  }

  // ✅ NEW: If this order belongs to a quote, and all *relevant* jobs are done, mark the quote complete.
  // Relevant = jobs not CANCELLED. Done = COMPLETE / COMPLETED / CLOSED.
  if (row?.quote_id) {
    try {
      const agg = await query(
        `SELECT
          SUM(CASE WHEN LOWER(COALESCE(status,'')) NOT IN ('cancelled') THEN 1 ELSE 0 END) AS relevant,
          SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('complete','completed','closed') THEN 1 ELSE 0 END) AS done
        FROM orders
        WHERE quote_id = ?`,
        [row.quote_id]
      );

      const relevant = Number(agg.rows?.[0]?.relevant || 0);
      const done     = Number(agg.rows?.[0]?.done || 0);

      if (relevant > 0 && done === relevant) {
        await query(
          `UPDATE quotes
              SET status='complete',
                  updated_at=CURRENT_TIMESTAMP
            WHERE id = ?`,
          [row.quote_id]
        );
      }
      // Optional “demote” logic if a job reopens later:
      // else {
      //   await query(
      //     `UPDATE quotes
      //         SET status = CASE WHEN LOWER(COALESCE(status,''))='complete' THEN 'approved' ELSE status END,
      //             updated_at = CURRENT_TIMESTAMP
      //       WHERE id = ?`,
      //     [row.quote_id]
      //   );
      // }
    } catch (_) {
      // best-effort — don't block response
    }
  }

  return NextResponse.json(row);
}

