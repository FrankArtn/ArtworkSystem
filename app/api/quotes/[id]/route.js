// app/api/quotes/[id]/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });
export const dynamic = "force-dynamic";

/** GET /api/quotes/[id] */
export async function GET(_req, context) {
  const { id } = await context.params; // Next 15: await params
  const qid = Number(id);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");

  const r = await query(
    `SELECT id, quote_number, status, customer, created_at, updated_at
       FROM quotes WHERE id = ? LIMIT 1`,
    [qid]
  );
  const row = r.rows?.[0];
  if (!row) return jerr("quote not found", 404);
  return NextResponse.json(row);
}

/** PATCH /api/quotes/[id] — update allowed fields (status, customer) */
export async function PATCH(req, context) {
  const { id } = await context.params;
  const qid = Number(id);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");

  const body = await req.json().catch(() => ({}));

  const updates = [];
  const values  = [];

  // customer: accept string (trimmed), or null/empty -> store NULL
  if (Object.prototype.hasOwnProperty.call(body, "customer")) {
    let c = body.customer;
    if (typeof c === "string") c = c.trim();
    if (c === "" || c === null) c = null;
    updates.push("customer = ?");
    values.push(c);
  }

  // status: strict allow-list
  if (typeof body.status === "string") {
    const status = body.status.trim();
    const allowed = new Set([
      "draft",
      "pending_approval",
      "waiting_for_client_approval",
      "redo",
      "accepted",
      "approved",
      "complete",
      "won",
    ]);
    if (!allowed.has(status)) return jerr("unsupported status");
    updates.push("status = ?");
    values.push(status);
  }

  if (updates.length === 0) return jerr("no supported fields to update");

  const sql = `
    UPDATE quotes
       SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`;
  values.push(qid);

  const r = await query(sql, values);
  if (!r || r.rowsAffected === 0) return jerr("quote not found", 404);

  const out = await query(
    `SELECT id, quote_number, status, customer, created_at, updated_at
       FROM quotes WHERE id = ?`,
    [qid]
  );

  // ✅ NEW: if this order is tied to a quote, and ALL orders for that quote are complete/closed, mark the quote as "won"
  if (row?.quote_id) {
    try {
      const agg = await query(
        `SELECT
           COUNT(1) AS total,
           SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('complete','closed') THEN 1 ELSE 0 END) AS done
         FROM orders
         WHERE quote_id = ?`,
        [row.quote_id]
      );
      const total = Number(agg.rows?.[0]?.total || 0);
      const done  = Number(agg.rows?.[0]?.done || 0);

      if (total > 0 && done === total) {
        await query(
          `UPDATE quotes
              SET status='complete',
                  updated_at=CURRENT_TIMESTAMP
            WHERE id = ?`,
          [row.quote_id]
        );
      }
    } catch {
      // best-effort; don't block the response if this aggregation fails
    }
  }

  return NextResponse.json(out.rows?.[0] ?? null);
}

/**
 * DELETE /api/quotes/[id]
 *
 * Two modes:
 *  - Conditional cleanup for empty drafts: add ?emptyOnly=1
 *      Deletes only if status='draft' AND no quote_items exist.
 *  - Full delete (default): deletes quote + items, but blocks if any orders exist.
 */
export async function DELETE(req, context) {
  const { id } = await context.params;
  const qid = Number(id);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");

  // Check existence + current status
  const exist = await query(
    `SELECT id, COALESCE(status,'draft') AS status FROM quotes WHERE id=? LIMIT 1`,
    [qid]
  );
  if (!exist.rows?.length) return jerr("quote not found", 404);
  const status = String(exist.rows[0].status || "draft").toLowerCase();

  // Parse emptyOnly flag
  const url = new URL(req.url);
  const emptyOnlyParam = (url.searchParams.get("emptyOnly") || "").toLowerCase();
  const emptyOnly = ["1", "true", "yes"].includes(emptyOnlyParam);

  // Count items (be tolerant if quote_items doesn't exist)
  let hasItems = false;
  try {
    const ic = await query(`SELECT COUNT(1) AS c FROM quote_items WHERE quote_id=?`, [qid]);
    hasItems = Number(ic.rows?.[0]?.c || 0) > 0;
  } catch (e) {
    const msg = String(e?.message || "");
    if (!/no such table:\s*quote_items/i.test(msg)) throw e;
    hasItems = false;
  }

  if (emptyOnly) {
    // Beacon/cleanup mode: only delete empty drafts
    if (status === "draft" && !hasItems) {
      await query(`DELETE FROM quotes WHERE id=?`, [qid]);
      return NextResponse.json({ deleted: 1, mode: "empty-only" }, { status: 200 });
    }
    return NextResponse.json(
      { deleted: 0, mode: "empty-only", reason: status !== "draft" ? "not-draft" : "has-items" },
      { status: 200 }
    );
  }

  // Full delete path: block if orders exist
  const or = await query(`SELECT COUNT(1) AS c FROM orders WHERE quote_id = ?`, [qid]);
  if (Number(or.rows?.[0]?.c || 0) > 0) {
    return jerr(
      "Cannot delete: one or more orders were created for this quote. Delete those orders first.",
      409
    );
  }

  // No explicit BEGIN/COMMIT (libsql HTTP client sessions aren't sticky). Do sequential deletes.
  try {
    // Delete items first; ignore if quote_items table doesn't exist
    try {
      await query(`DELETE FROM quote_items WHERE quote_id = ?`, [qid]);
    } catch (e) {
      const msg = String(e?.message || "");
      if (!/no such table:\s*quote_items/i.test(msg)) throw e;
    }

    // Then delete the quote itself
    await query(`DELETE FROM quotes WHERE id = ?`, [qid]);
  } catch (e) {
    return jerr(e?.message || "Failed to delete quote", 500);
  }

  return NextResponse.json({ deleted: 1, mode: "full" }, { status: 200 });
}
