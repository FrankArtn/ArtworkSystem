// app/api/orders/[id]/materials/return/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db.js';

const jerr = (msg, code = 400, extra = {}) =>
  NextResponse.json({ error: msg, ...extra }, { status: code });

export async function POST(req, context) {
  // Next 15: params must be awaited
  const { id } = await context.params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) return jerr('Invalid order id');

  const { allocation_id, qty } = await req.json().catch(() => ({}));
  const matId = Number(allocation_id); // NOTE: this is a MATERIAL ID (your table groups by material)
  const retQty = Number(qty);

  if (!Number.isFinite(matId) || !Number.isFinite(retQty) || retQty <= 0) {
    return jerr('Invalid allocation/material or qty');
  }

  // Get job_number + status
  const ord = await query(
    `SELECT job_number, LOWER(COALESCE(status,'')) AS status FROM orders WHERE id = ? LIMIT 1`,
    [orderId]
  );
  const order = ord.rows?.[0];
  if (!order?.job_number) return jerr('Order not found', 404);

  const job = order.job_number;
  const isComplete = order.status === 'complete';

  try {
    if (isComplete) {
      // ===== Completed job =====
      // 1) Ensure there is enough consumed qty to return (sum across rows)
      const s = await query(
        `SELECT COALESCE(SUM(qty),0) AS total_qty, COALESCE(MAX(unit_cost), 0) AS last_cost
           FROM consumed_allocations
          WHERE job_number = ? AND material_id = ?`,
        [job, matId]
      );
      const totalConsumed = Number(s.rows?.[0]?.total_qty || 0);
      const lastCost = Number(s.rows?.[0]?.last_cost || 0);

      if (retQty > totalConsumed) {
        return jerr(`Return qty exceeds allocated qty (allocated ${totalConsumed}, trying to return ${retQty})`, 409);
      }

      // 2) Insert a negative row (keeps history; your GET sums qty so the line shrinks)
      await query(
        `INSERT INTO consumed_allocations (material_id, job_number, qty, unit_cost)
         VALUES (?, ?, ?, ?)`,
        [matId, job, -retQty, lastCost]
      );

      // 3) Your policy: add returns to 'used'
      await query(
        `UPDATE materials
            SET used = COALESCE(used,0) + ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [retQty, matId]
      );

      return NextResponse.json({ ok: true, material_id: matId, returned: retQty, mode: 'complete' });
    }

    // ===== Not complete (open / in_progress) =====
    // Rows live in wip_allocations; your GET groups by material so we target by (material_id, job_number)
    // 1) Check available WIP qty
    const s2 = await query(
      `SELECT COALESCE(SUM(qty),0) AS total_qty FROM wip_allocations WHERE job_number = ? AND material_id = ?`,
      [job, matId]
    );
    const totalWip = Number(s2.rows?.[0]?.total_qty || 0);
    if (retQty > totalWip) {
      return jerr(`Return qty exceeds allocated qty (allocated ${totalWip}, trying to return ${retQty})`, 409);
    }

    // 2) Move WIP -> USED in materials pools
    await query(
      `UPDATE materials
          SET wip_qty = MAX(0, COALESCE(wip_qty,0) - ?),
              used    = COALESCE(used,0) + ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [retQty, retQty, matId]
    );

    // 3) Reduce the single wip_allocations row (you upserted to one per material+job).
    //    If multiple rows exist historically, collapse them to one by subtracting on the newest row first.
    //    Easiest stable approach: subtract on the newest row; if it goes below zero, zero it and subtract the remainder on older ones.
    //    To keep this minimal and robust, we do it in a small loop at most a few iterations (usually 1).
    let remaining = retQty;
    while (remaining > 0) {
      const pick = await query(
        `SELECT id, qty FROM wip_allocations
          WHERE job_number = ? AND material_id = ?
          ORDER BY datetime(COALESCE(created_at,'')) DESC, id DESC
          LIMIT 1`,
        [job, matId]
      );
      const row = pick.rows?.[0];
      if (!row) break; // nothing left (shouldn't happen due to guard)
      const curQty = Number(row.qty || 0);
      const take = Math.min(curQty, remaining);
      const newQty = curQty - take;

      if (newQty > 0) {
        await query(`UPDATE wip_allocations SET qty = ? WHERE id = ?`, [newQty, row.id]);
      } else {
        await query(`DELETE FROM wip_allocations WHERE id = ?`, [row.id]);
      }
      remaining -= take;
    }

    return NextResponse.json({ ok: true, material_id: matId, returned: retQty, mode: 'wip' });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Return failed' }, { status: 500 });
  }
}
