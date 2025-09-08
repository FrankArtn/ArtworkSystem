import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { randomUUID } from "crypto";

// GET /api/materials
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    let sql, params;
    if (q) {
      sql = `
        SELECT id, name, sku, category, unit, sell_price, stock_qty
        FROM materials
        WHERE name LIKE ? OR sku LIKE ?
        ORDER BY name ASC
        LIMIT 200
      `;
      params = [`%${q}%`, `%${q}%`];
    } else {
      sql = `
        SELECT id, name, sku, category, unit, sell_price, stock_qty
        FROM materials
        ORDER BY updated_at DESC
        LIMIT 200
      `;
      params = [];
    }

    const res = await query(sql, params);
    return NextResponse.json(res.rows || []);
  } catch (err) {
    console.error("GET /materials failed:", err);
    return NextResponse.json({ error: "Failed to fetch materials" }, { status: 500 });
  }
}

// POST /api/materials
export async function POST(req) {
  try {
    const body = await req.json();

    // Basic validation
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await query(
      `
      INSERT INTO materials (
        id, name, sku, category, unit,
        cost_price, sell_price, stock_qty,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        name,
        body.sku || null,
        body.category || null,
        body.unit || null,
        Number(body.cost_price || 0),
        Number(body.sell_price || 0),
        Number(body.stock_qty || 0),
        now,
        now,
      ]
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("POST /materials failed:", err);
    return NextResponse.json({ error: "Failed to create material" }, { status: 500 });
  }
}
