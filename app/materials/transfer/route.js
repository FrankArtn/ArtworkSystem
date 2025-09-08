import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req) {
  try {
    const { id, qty } = await req.json();
    const amount = Number(qty);

    if (!id || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "id and positive qty required" }, { status: 400 });
    }

    // Start a transaction
    await query("BEGIN");

    // Fetch current on-hand
    const cur = await query("SELECT stock_qty, wip_qty FROM materials WHERE id = ?", [id]);
    if (!cur.rows?.length) {
      await query("ROLLBACK");
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    const { stock_qty } = cur.rows[0];
    if (stock_qty < amount) {
      await query("ROLLBACK");
      return NextResponse.json({ error: "Insufficient on-hand stock" }, { status: 409 });
    }

    const now = new Date().toISOString();

    // Move from on-hand to WIP
    await query(
      `UPDATE materials
       SET stock_qty = stock_qty - ?,
           wip_qty   = wip_qty + ?,
           updated_at = ?
       WHERE id = ?`,
      [amount, amount, now, id]
    );

    await query("COMMIT");

    // Return updated totals
    const updated = await query(
      `SELECT stock_qty, wip_qty, (stock_qty + wip_qty) AS total_stock
       FROM materials WHERE id = ?`,
      [id]
    );

    return NextResponse.json({ ok: true, id, ...updated.rows[0] }, { status: 200 });
  } catch (err) {
    console.error("POST /materials/transfer failed:", err);
    try { await query("ROLLBACK"); } catch {}
    return NextResponse.json({ error: "Transfer failed" }, { status: 500 });
  }
}
