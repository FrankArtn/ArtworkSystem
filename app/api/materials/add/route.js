import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req) {
  try {
    const { id, delta } = await req.json();

    if (id === undefined || id === null || id === "") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const qty = Number(delta);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "delta must be a positive number" }, { status: 400 });
    }

    // Try to treat id as both numeric and text to cover old UUID rows and new INT rows.
    const numericId = Number(id);
    const isNumericId = Number.isFinite(numericId);

    // 1) Update base table
    if (isNumericId) {
      await query(
        `UPDATE materials
           SET unallocated_stock = COALESCE(unallocated_stock, 0) + ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [qty, numericId]
      );
    } else {
      await query(
        `UPDATE materials
           SET unallocated_stock = COALESCE(unallocated_stock, 0) + ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [qty, String(id)]
      );
    }

    // 2) Return the updated row (from the view if present; fallback to table)
    const params = isNumericId ? [numericId] : [String(id)];

    try {
      const res = await query(
        `SELECT id, name, sku, unit, sell_price,
                unallocated_stock, wip_qty, stock_qty, created_at, updated_at
           FROM materials_with_totals
          WHERE id = ?
          LIMIT 1`,
        params
      );
      if (!res.rows?.length) {
        // If the view exists but didn't return, try base table (in case view missing/broken)
        const base = await query(
          `SELECT id, name, sku, unit,
                  COALESCE(sell_price,0)        AS sell_price,
                  COALESCE(unallocated_stock,0) AS unallocated_stock,
                  COALESCE(wip_qty,0)           AS wip_qty,
                  (COALESCE(unallocated_stock,0)+COALESCE(wip_qty,0)) AS stock_qty,
                  created_at, updated_at
             FROM materials
            WHERE id = ?
            LIMIT 1`,
          params
        );
        if (!base.rows?.length) {
          return NextResponse.json({ error: "Material not found" }, { status: 404 });
        }
        return NextResponse.json(base.rows[0]);
      }
      return NextResponse.json(res.rows[0]);
    } catch (e) {
      // If the view doesn't exist, fall back to base table
      const base = await query(
        `SELECT id, name, sku, unit,
                COALESCE(sell_price,0)        AS sell_price,
                COALESCE(unallocated_stock,0) AS unallocated_stock,
                COALESCE(wip_qty,0)           AS wip_qty,
                (COALESCE(unallocated_stock,0)+COALESCE(wip_qty,0)) AS stock_qty,
                created_at, updated_at
           FROM materials
          WHERE id = ?
          LIMIT 1`,
        params
      );
      if (!base.rows?.length) {
        return NextResponse.json({ error: "Material not found" }, { status: 404 });
      }
      return NextResponse.json(base.rows[0]);
    }
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Add stock failed" }, { status: 500 });
  }
}
