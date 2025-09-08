import { query } from "@/lib/db";

export async function GET() {
  try {
    // Simple query just to confirm DB is reachable
    const res = await query(`SELECT COUNT(*) AS materials FROM materials`);
    const count = res.rows?.[0]?.materials ?? 0;

    return new Response(
      JSON.stringify({ ok: true, materials: count, ts: new Date().toISOString() }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Health check failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "DB not reachable" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
