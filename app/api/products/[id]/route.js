// app/api/products/[id]/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
const jerr = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });

export async function DELETE(_req, context) {
  const { id } = await context.params; // Next 15 style
  const pid = Number(id);
  if (!Number.isFinite(pid)) return jerr('invalid product id');

  // Ensure it exists
  const exists = await query(`SELECT id FROM products WHERE id = ? LIMIT 1`, [pid]);
  if (!exists.rows?.length) return jerr('product not found', 404);

  // Block deletion if product is referenced by any quote items
  try {
    const r = await query(
      `SELECT COUNT(1) AS cnt FROM quote_items WHERE product_id = ?`,
      [pid]
    );
    const cnt = Number(r.rows?.[0]?.cnt || 0);
    if (cnt > 0) {
      return jerr(`Product is used by ${cnt} quote item(s); cannot delete.`, 409);
    }
  } catch {
    // If quote_items table doesn't exist, just proceed with deletion
  }

  try {
    await query(`DELETE FROM products WHERE id = ?`, [pid]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return jerr(e?.message || 'Failed to delete product', 500);
  }
}
