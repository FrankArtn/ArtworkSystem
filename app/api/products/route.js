// app/api/products/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    // Discover available columns safely
    const info = await query(`PRAGMA table_info(products)`);
    const cols = new Set((info.rows || []).map(r => r.name));
    const has = (c) => cols.has(c);

    const fields = [
      "id",
      has("name") ? "name" : "CAST(id AS TEXT) AS name",
      has("sku") ? "sku" : "NULL AS sku",
      has("unit") ? "unit" : "NULL AS unit",
      has("cost_price") ? "cost_price" : "NULL AS cost_price",
      has("base_setup_cost") ? "base_setup_cost" : "NULL AS base_setup_cost",
    ];

    // cost_hint (for UI): prefer cost_price, else base_setup_cost, else 0
    const costExprs = [];
    if (has("cost_price")) costExprs.push("cost_price");
    if (has("base_setup_cost")) costExprs.push("base_setup_cost");
    fields.push(`COALESCE(${costExprs.length ? costExprs.join(", ") : "0"}, 0) AS cost_hint`);

    // Optional search
    const where = [];
    const params = [];
    if (q) {
      if (has("name")) { where.push("name LIKE ? COLLATE NOCASE"); params.push(`%${q}%`); }
      if (has("sku"))  { where.push("sku  LIKE ? COLLATE NOCASE"); params.push(`%${q}%`); }
    }
    const whereSql = where.length ? `WHERE ${where.join(" OR ")}` : "";

    const orderSql = has("name")
      ? "ORDER BY name COLLATE NOCASE ASC, id DESC"
      : "ORDER BY id DESC";

    const sql = `SELECT ${fields.join(", ")} FROM products ${whereSql} ${orderSql} LIMIT 200`;
    const r = await query(sql, params);

    return NextResponse.json(r.rows || []);
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch products" },
      { status: 500 }
    );
  }
}
