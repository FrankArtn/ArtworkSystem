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
    const costExpr =
      has("cost_price") && has("base_setup_cost")
        ? "COALESCE(cost_price, base_setup_cost, 0)"
        : has("cost_price")
        ? "COALESCE(cost_price, 0)"
        : has("base_setup_cost")
        ? "COALESCE(base_setup_cost, 0)"
        : "0";
    fields.push(`${costExpr} AS cost_hint`);

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

// POST /api/products — create a product (name required)
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const numOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const baseSetupCost = numOrNull(body.base_setup_cost);
    const costPrice     = numOrNull(body.cost_price);
    const sku  = typeof body.sku  === "string" ? body.sku.trim()  : null;
    const unit = typeof body.unit === "string" ? body.unit.trim() : null;

    // Discover available columns
    const info = await query(`PRAGMA table_info(products)`);
    const cols = new Set((info.rows || []).map(r => r.name));
    const has = (c) => cols.has(c);

    // Build insert dynamically based on existing columns
    const fields = [];
    const ph     = [];
    const vals   = [];

    if (has("name")) { fields.push("name"); ph.push("?"); vals.push(name); }
    else {
      return NextResponse.json({ error: "products.name column missing" }, { status: 500 });
    }

    if (has("sku")  && sku  !== null) { fields.push("sku");  ph.push("?"); vals.push(sku); }
    if (has("unit") && unit !== null) { fields.push("unit"); ph.push("?"); vals.push(unit); }

    if (has("cost_price") && costPrice !== null) {
      fields.push("cost_price"); ph.push("?"); vals.push(costPrice);
    }

    if (has("base_setup_cost")) {
      fields.push("base_setup_cost"); ph.push("?"); vals.push(baseSetupCost ?? 0);
    }

    if (has("created_at")) { fields.push("created_at"); ph.push("CURRENT_TIMESTAMP"); }
    if (has("updated_at")) { fields.push("updated_at"); ph.push("CURRENT_TIMESTAMP"); }

    await query(
      `INSERT INTO products (${fields.join(", ")}) VALUES (${ph.join(", ")})`,
      vals
    );

    // Return the newly created row using the same safe field selection
    const costExpr =
      has("cost_price") && has("base_setup_cost")
        ? "COALESCE(cost_price, base_setup_cost, 0)"
        : has("cost_price")
        ? "COALESCE(cost_price, 0)"
        : has("base_setup_cost")
        ? "COALESCE(base_setup_cost, 0)"
        : "0";

    const selFields = [
      "id",
      has("name") ? "name" : "CAST(id AS TEXT) AS name",
      has("sku") ? "sku" : "NULL AS sku",
      has("unit") ? "unit" : "NULL AS unit",
      has("cost_price") ? "cost_price" : "NULL AS cost_price",
      has("base_setup_cost") ? "base_setup_cost" : "NULL AS base_setup_cost",
      `${costExpr} AS cost_hint`,
    ];

    const out = await query(
      `SELECT ${selFields.join(", ")}
         FROM products
        WHERE id = last_insert_rowid()
        LIMIT 1`
    );

    return NextResponse.json(out.rows?.[0] ?? null, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Failed to create product" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });
export async function DELETE(_req, context) {
  const { id } = await context.params;
  const pid = Number(id);
  if (!Number.isFinite(pid)) return jerr("invalid product id");

  // Optional safety: block deletion if product is referenced by quotes/jobs
  try {
    const ref = await query(`
      SELECT
        (SELECT COUNT(1) FROM quote_items WHERE product_id = ?) AS qi_count,
        (SELECT COUNT(1) FROM orders
           WHERE quote_item_id IN (SELECT id FROM quote_items WHERE product_id = ?)
        ) AS order_count
    `, [pid, pid]);

    const qi = Number(ref.rows?.[0]?.qi_count || 0);
    const ord = Number(ref.rows?.[0]?.order_count || 0);
    if (qi > 0 || ord > 0) {
      return jerr("This product is used by existing quotes/jobs and cannot be deleted.", 409);
    }
  } catch {
    // If those tables don't exist, skip the pre-check
  }

  const r = await query(`DELETE FROM products WHERE id = ?`, [pid]);

  const affected =
    r?.rowsAffected ?? r?.rows_affected ?? r?.affectedRows ?? 0;

  if (!affected) return jerr("product not found", 404);

  return NextResponse.json({ ok: true, id: pid });
}
