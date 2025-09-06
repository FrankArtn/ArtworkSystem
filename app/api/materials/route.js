// app/api/materials/route.js
import db from "@/lib/db";

export async function GET() {
  const res = await db.execute(`SELECT * FROM materials ORDER BY name`);
  return new Response(JSON.stringify(res.rows), { status: 200 });
}

export async function POST(req) {
  const body = await req.json();

  // CASE A: add stock to existing material
  if (typeof body.materialId === "number" && typeof body.qty === "number") {
    await db.execute({
      sql: `UPDATE materials SET on_hand = on_hand + ? WHERE id = ?`,
      args: [body.qty, body.materialId],
    });
    return new Response(JSON.stringify({ ok: true, action: "add_stock" }), { status: 200 });
  }

  // CASE B: create a new material
  const { name, sku, unit, costPerUnit, reorderLevel = 0, onHand = 0 } = body || {};
  if (!name || !unit || typeof costPerUnit !== "number") {
    return new Response(
      JSON.stringify({ error: "Missing required fields: name, unit, costPerUnit" }),
      { status: 400 }
    );
  }

  try {
    const result = await db.execute({
      sql: `INSERT INTO materials (sku, name, unit, cost_per_unit, reorder_level, on_hand)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [sku || null, name, unit, costPerUnit, reorderLevel, onHand],
    });

    // libsql returns lastInsertRowid in result.lastInsertRowid (string); fetch the row
    const { rows } = await db.execute({
      sql: `SELECT * FROM materials WHERE id = ?`,
      args: [Number(result.lastInsertRowid)],
    });

    return new Response(JSON.stringify({ ok: true, action: "create", material: rows[0] }), {
      status: 201,
    });
  } catch (e) {
    // handle UNIQUE(sku) conflicts nicely
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("unique") && msg.toLowerCase().includes("sku")) {
      return new Response(JSON.stringify({ error: "SKU already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create material" }), { status: 500 });
  }
}
