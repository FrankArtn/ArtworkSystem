// app/api/materials/add/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const errJson = (e, fallback = "Add stock failed") =>
  ({ error: e?.message ? String(e.message) : fallback });

export async function POST(req) {
  try {
    const { id, delta, cost_price, unit_cost } = await req.json();

    if (id === undefined || id === null || id === "") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const qty = Number(delta);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "delta must be a positive number" }, { status: 400 });
    }

    const idParam = String(id);
    const costInputRaw = (cost_price ?? unit_cost);
    const hasCostInput = costInputRaw !== undefined && costInputRaw !== null && `${costInputRaw}` !== "";
    let costInput = null;
    if (hasCostInput) {
      costInput = Number(costInputRaw);
      if (!Number.isFinite(costInput) || costInput < 0) {
        return NextResponse.json({ error: "cost_price must be a non-negative number" }, { status: 400 });
      }
    }

    // Ensure the material exists & get current unallocated + cost_price
    const cur = await query(
      `SELECT COALESCE(unallocated_stock,0) AS unalloc,
              COALESCE(cost_price, NULL)    AS cost_price
         FROM materials
        WHERE CAST(id AS TEXT) = ?
        LIMIT 1`,
      [idParam]
    );
    if (!cur.rows?.length) {
      return NextResponse.json({ error: `Material not found (id=${idParam})` }, { status: 404 });
    }

    const oldUnalloc = Number(cur.rows[0].unalloc) || 0;
    const oldCost    = cur.rows[0].cost_price == null ? null : Number(cur.rows[0].cost_price);

    if (hasCostInput) {
      // Weighted-average using UNALLOCATED only
      const baseCost = (oldCost == null) ? costInput : oldCost;
      const newTotal = oldUnalloc + qty;
      const newAvg   = newTotal <= 0
        ? costInput
        : (oldUnalloc * baseCost + qty * costInput) / newTotal;

      await query(
        `UPDATE materials
            SET unallocated_stock = COALESCE(unallocated_stock,0) + ?,
                cost_price        = ?,
                updated_at        = CURRENT_TIMESTAMP
          WHERE CAST(id AS TEXT) = ?`,
        [qty, newAvg, idParam]
      );
    } else {
      // No cost provided: just bump quantity
      await query(
        `UPDATE materials
            SET unallocated_stock = COALESCE(unallocated_stock,0) + ?,
                updated_at        = CURRENT_TIMESTAMP
          WHERE CAST(id AS TEXT) = ?`,
        [qty, idParam]
      );
    }

    // Return updated row (view preferred)
    try {
      const v = await query(
        `SELECT id, name, sku, unit, cost_price,
                unallocated_stock, wip_qty, stock_qty,
                created_at, updated_at
           FROM materials_with_totals
          WHERE CAST(id AS TEXT) = ?
          LIMIT 1`,
        [idParam]
      );
      if (v.rows?.length) return NextResponse.json(v.rows[0]);
    } catch {}

    const b = await query(
      `SELECT id, name, sku, unit,
              COALESCE(cost_price,0)        AS cost_price,
              COALESCE(unallocated_stock,0) AS unallocated_stock,
              COALESCE(wip_qty,0)           AS wip_qty,
              (COALESCE(unallocated_stock,0)+COALESCE(wip_qty,0)) AS stock_qty,
              created_at, updated_at
         FROM materials
        WHERE CAST(id AS TEXT) = ?
        LIMIT 1`,
      [idParam]
    );
    return NextResponse.json(b.rows?.[0] ?? null);
  } catch (e) {
    return NextResponse.json(errJson(e), { status: 500 });
  }
}
