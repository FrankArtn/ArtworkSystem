// app/api/quotes/[id]/cleanup/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(_req, { params }) {
  const { id } = await params;
  const qid = Number(id);
  if (!Number.isFinite(qid)) return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });

  const [qs, cnt] = await Promise.all([
    query("SELECT status FROM quotes WHERE id=? LIMIT 1", [qid]),
    query("SELECT COUNT(1) AS c FROM quote_items WHERE quote_id=?", [qid]),
  ]);
  if (!qs.rows?.length) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const status   = (qs.rows[0].status ?? "draft").toLowerCase();
  const hasItems = Number(cnt.rows?.[0]?.c || 0) > 0;

  if (status === "draft" && !hasItems) {
    await query("DELETE FROM quotes WHERE id=?", [qid]);
    return NextResponse.json({ ok: true, deleted: 1 });
  }
  return NextResponse.json({ ok: true, deleted: 0 }); // noop if not empty draft
}
