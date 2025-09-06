import db from "@/lib/db";

export async function GET() {
  const { rows } = await db.execute(`SELECT COUNT(*) AS materials FROM materials`);
  return new Response(JSON.stringify({ ok: true, materials: rows[0].materials }), { status: 200 });
}
