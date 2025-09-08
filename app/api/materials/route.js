import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/materials
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const where = q ? "WHERE name LIKE ? COLLATE NOCASE OR sku LIKE ? COLLATE NOCASE" : "";

    // 1) Try the view first (preferred)
    try {
      const sqlView = `
        SELECT id, name, sku, unit, cost_price,
               unallocated_stock, wip_qty, stock_qty
        FROM materials_with_totals
        ${where}
        ORDER BY updated_at DESC
        LIMIT 200
      `;
      const res = await query(sqlView, params);
      return NextResponse.json(res.rows || []);
    } catch (e) {
      // 2) View missing or broken? fallback to base table
      const msg = String(e?.message || "");
      const brokenView =
        /no such table:\s*materials_with_totals/i.test(msg) ||
        /relation\s+"materials_with_totals"\s+does not exist/i.test(msg) ||
        /no such column:/i.test(msg);

      if (!brokenView) throw e;

      const baseSelect = `
        SELECT
          id, name, sku, unit,
          COALESCE(cost_price, 0)        AS cost_price,
          COALESCE(unallocated_stock, 0) AS unallocated_stock,
          COALESCE(wip_qty, 0)           AS wip_qty,
          (COALESCE(unallocated_stock, 0) + COALESCE(wip_qty, 0)) AS stock_qty
        FROM materials
        ${where}
      `;

      try {
        const sqlBaseWithUpdated = `${baseSelect} ORDER BY updated_at DESC LIMIT 200`;
        const res = await query(sqlBaseWithUpdated, params);
        return NextResponse.json(res.rows || []);
      } catch (e2) {
        // If updated_at doesn't exist, retry ordering by name
        const msg2 = String(e2?.message || "");
        const missingUpdated = /no such column:\s*updated_at/i.test(msg2);
        if (!missingUpdated) throw e2;

        const sqlBaseByName = `${baseSelect} ORDER BY name ASC LIMIT 200`;
        const res = await query(sqlBaseByName, params);
        return NextResponse.json(res.rows || []);
      }
    }
  } catch (err) {
    console.error("GET /materials failed:", err);
    const body =
      process.env.NODE_ENV === "production"
        ? { error: "Failed to fetch materials" }
        : { error: "Failed to fetch materials", detail: String(err?.message || err) };
    return NextResponse.json(body, { status: 500 });
  }
}

// POST /api/materials
export async function POST(req) {
  try {
    const body = await req.json();

    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const values = [
      name,
      body.sku || null,
      body.category || null,
      body.unit || null,
      Number(body.cost_price ?? body.costPerUnit ?? 0),
      Number(body.sell_price ?? 0),
      Number(body.unallocated_stock ?? body.stock_qty ?? body.onHand ?? 0), // initial on-hand
      Number(body.wip_qty ?? 0),
      now,
      now,
    ];

    // Try insert with timestamps first; return the auto-incremented id
    try {
      const res = await query(
        `
        INSERT INTO materials (
          name, sku, category, unit,
          cost_price, sell_price, unallocated_stock, wip_qty,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        `,
        values
      );
      const id = res.rows?.[0]?.id;
      return NextResponse.json({ id }, { status: 201 });
    } catch (e) {
      // If created_at/updated_at don't exist yet, retry without them
      const msg = String(e?.message || "");
      const missingTs =
        /no such column:\s*created_at/i.test(msg) ||
        /no such column:\s*updated_at/i.test(msg);

      if (!missingTs) throw e;

      const res2 = await query(
        `
        INSERT INTO materials (
          name, sku, category, unit,
          cost_price, sell_price, unallocated_stock, wip_qty
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        `,
        values.slice(0, 8) // without created_at/updated_at
      );
      const id = res2.rows?.[0]?.id;
      return NextResponse.json({ id }, { status: 201 });
    }
  } catch (err) {
    console.error("POST /materials failed:", err);
    const body =
      process.env.NODE_ENV === "production"
        ? { error: "Failed to create material" }
        : { error: "Failed to create material", detail: String(err?.message || err) };
    return NextResponse.json(body, { status: 500 });
  }
}
