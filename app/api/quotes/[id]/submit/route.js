import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(_req, { params }) {
  try {
    const id = Number(params.id);
    if (!(id > 0)) return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
    await query(`UPDATE quotes SET status='pending_approval', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id]);
    const r = await query(`SELECT id, quote_number, status FROM quotes WHERE id=?`, [id]);
    return NextResponse.json(r.rows?.[0] ?? null);
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Submit failed" }, { status: 500 });
  }
}
