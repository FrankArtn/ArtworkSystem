// app/api/quotes/[id]/status/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });
export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const qid = Number(id);
  if (!Number.isFinite(qid)) return jerr("invalid quote id");

  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "").trim();

  const allowed = new Set([
    "redo",
    "waiting_for_client_approval",
    "pending_approval", // if you want to use elsewhere
  ]);
  if (!allowed.has(status)) return jerr("unsupported status");

  const r = await query(`UPDATE quotes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, qid]);
  if (!r || r.rowsAffected === 0) return jerr("quote not found", 404);

  const q = await query(`SELECT * FROM quotes WHERE id = ? LIMIT 1`, [qid]);
  return NextResponse.json(q.rows?.[0] ?? null);
}
