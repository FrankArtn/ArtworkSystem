import db from "@/lib/db";

export async function GET() {
  const res = await db.execute(`SELECT * FROM materials ORDER BY name`);
  return new Response(JSON.stringify(res.rows), { status: 200 });
}

export async function POST(req) {
  const { materialId, qty } = await req.json();
  await db.execute({
    sql: `UPDATE materials SET on_hand = on_hand + ? WHERE id = ?`,
    args: [qty, materialId],
  });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
