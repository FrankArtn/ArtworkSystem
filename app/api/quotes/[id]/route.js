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
 * Modes:
 *  - ?emptyOnly=1 → delete only empty drafts (unchanged).
 *  - Default      → delete the quote (+ items). If jobs exist:
 *      • BLOCK when any job is in WIP/complete/closed OR has material allocations.
 *      • Otherwise:
 *          - If quote is approved/accepted → cascade delete those jobs.
 *          - If quote is not approved/accepted → BLOCK (same as before).
 */
export async function DELETE(req, context) {
  const { id } = await context.params;
  const qid = Number(id);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");

  // Load quote + status
  const qr = await query(
    `SELECT id, COALESCE(status,'draft') AS status FROM quotes WHERE id=? LIMIT 1`,
    [qid]
  );
  if (!qr.rows?.length) return jerr("quote not found", 404);
  const quoteStatus = String(qr.rows[0].status || "draft").toLowerCase();

  // Parse emptyOnly flag
  const url = new URL(req.url);
  const emptyOnly = ["1","true","yes"].includes((url.searchParams.get("emptyOnly")||"").toLowerCase());

  // Count items for emptyOnly mode (tolerant if table missing)
  let hasItems = false;
  try {
    const ic = await query(`SELECT COUNT(1) AS c FROM quote_items WHERE quote_id=?`, [qid]);
    hasItems = Number(ic.rows?.[0]?.c || 0) > 0;
  } catch (e) {
    if (!/no such table:\s*quote_items/i.test(String(e?.message||""))) throw e;
  }

  if (emptyOnly) {
    if (quoteStatus === "draft" && !hasItems) {
      await query(`DELETE FROM quotes WHERE id=?`, [qid]);
      return NextResponse.json({ deleted: 1, mode: "empty-only" }, { status: 200 });
    }
    return NextResponse.json(
      { deleted: 0, mode: "empty-only", reason: quoteStatus !== "draft" ? "not-draft" : "has-items" },
      { status: 200 }
    );
  }

  // Fetch related jobs
  const jr = await query(
    `SELECT id, job_number, LOWER(COALESCE(status,'')) AS status
       FROM orders
      WHERE quote_id = ?`,
    [qid]
  );
  const jobs = jr.rows || [];
  const jobCount = jobs.length;

  // If jobs exist, check WIP/Complete and allocations
  let anyWipOrDone = false;
  if (jobCount > 0) {
    anyWipOrDone = jobs.some(j =>
      j.status === "in_progress" || j.status === "complete" || j.status === "closed"
    );

    // Check allocations by job_number (only for jobs that actually have a job_number)
    const jobNums = jobs.map(j => String(j.job_number || "")).filter(Boolean);
    let allocCount = 0;
    if (jobNums.length) {
      const placeholders = jobNums.map(() => "?").join(",");
      try {
        const ar = await query(
          `SELECT COUNT(1) AS c
             FROM wip_allocations
            WHERE job_number IN (${placeholders})`,
          jobNums
        );
        allocCount = Number(ar.rows?.[0]?.c || 0);
      } catch (e) {
        // If the allocations table doesn't exist, treat as no allocations
        if (!/no such table:\s*wip_allocations/i.test(String(e?.message||""))) throw e;
      }
    }

    // BLOCK deletion if any job is WIP/done OR has any allocations
    if (anyWipOrDone || allocCount > 0) {
      return jerr(
        "Cannot delete: one or more jobs are in WIP/complete/closed or have materials allocated. " +
        "Deallocate materials and return jobs to 'open' to delete.",
        409
      );
    }
  }

  // If we get here and jobs exist:
  // - Allow cascade only when quote is approved/accepted
  if (jobCount > 0) {
    const canCascade = quoteStatus === "approved" || quoteStatus === "accepted";
    if (!canCascade) {
      return jerr(
        "Cannot delete: jobs exist for this quote. Only approved/accepted quotes can be deleted automatically " +
        "with their jobs (when none are WIP/complete and no allocations exist).",
        409
      );
    }
  }

  // Proceed with deletes (sequential; no explicit txn)
  try {
    // 1) Delete items (ignore if table missing)
    try { await query(`DELETE FROM quote_items WHERE quote_id=?`, [qid]); }
    catch (e) { if (!/no such table:\s*quote_items/i.test(String(e?.message||""))) throw e; }

    // 2) If allowed, delete jobs for this quote
    if (jobCount > 0) {
      await query(`DELETE FROM orders WHERE quote_id=?`, [qid]);
      // (NOTE) We intentionally do NOT delete wip_allocations here — they shouldn't exist
      // because we blocked earlier if any allocation was present.
    }

    // 3) Delete the quote
    await query(`DELETE FROM quotes WHERE id=?`, [qid]);
  } catch (e) {
    return jerr(e?.message || "Failed to delete quote", 500);
  }

  return NextResponse.json(
    { deleted: 1, mode: "full", cascadedJobs: jobCount },
    { status: 200 }
  );
}

