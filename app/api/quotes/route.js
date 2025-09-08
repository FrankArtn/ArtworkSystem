// app/api/quotes/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/quotes?q=...
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const where = q ? `WHERE COALESCE(quote_number, '') LIKE ? OR CAST(id AS TEXT) LIKE ?` : "";
    const params = q ? [`%${q}%`, `%${q}%`] : [];

    try {
      const sql = `
        SELECT id, quote_number, status, created_at, updated_at
        FROM quotes
        ${where}
        ORDER BY updated_at DESC, created_at DESC, id DESC
        LIMIT 200
      `;
      const r = await query(sql, params);
      return NextResponse.json(r.rows || []);
    } catch (e) {
      const msg = String(e?.message || "");
      const missingTs = /no such column:\s*(updated_at|created_at)/i.test(msg);
      if (!missingTs) throw e;

      const r2 = await query(
        `SELECT id, quote_number, status FROM quotes ${where} ORDER BY id DESC LIMIT 200`,
        params
      );
      return NextResponse.json(r2.rows || []);
    }
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to fetch quotes" }, { status: 500 });
  }
}

// POST /api/quotes → create a draft quote
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const customer = (body.customer ?? "").trim() || null;

    await query(
      `INSERT INTO quotes (
         customer, status, subtotal_cost, markup_pct, tax_rate, total_price, created_at, updated_at
       )
       VALUES (?, 'draft', 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [customer]
    );

    const r = await query(
      `SELECT id, quote_number, status, created_at, updated_at
         FROM quotes
        WHERE id = last_insert_rowid()
        LIMIT 1`
    );
    return NextResponse.json(r.rows?.[0] ?? null, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Failed to create quote" }, { status: 500 });
  }
}
