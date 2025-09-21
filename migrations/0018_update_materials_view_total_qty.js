// migrations/0018_update_materials_view_total_qty.js
// Recreate `materials_with_totals` so it exposes `used` and
// sets stock_qty = unallocated_stock + wip_qty + used.
// No explicit BEGIN/COMMIT (Turso/libsql over HTTP friendly).

import { query } from '../lib/db.js'; // adjust path if needed

export async function up() {
  // Drop if exists (idempotent)
  try {
    await query(`DROP VIEW IF EXISTS materials_with_totals;`);
  } catch (e) {
    // ignore
  }

  await query(`
    CREATE VIEW materials_with_totals AS
    SELECT
      m.id,
      m.name,
      m.sku,
      m.category,
      m.unit,
      m.cost_price,
      m.sell_price,
      COALESCE(m.unallocated_stock, 0) AS unallocated_stock,
      COALESCE(m.wip_qty, 0)           AS wip_qty,
      COALESCE(m.used, 0)              AS used,
      (COALESCE(m.unallocated_stock,0) + COALESCE(m.wip_qty,0) + COALESCE(m.used,0)) AS stock_qty,
      m.created_at,
      m.updated_at
    FROM materials m;
  `);
}

export async function down() {
  // Restore the older behavior (stock_qty = unallocated + wip; no used column)
  try {
    await query(`DROP VIEW IF EXISTS materials_with_totals;`);
  } catch (e) {
    // ignore
  }

  await query(`
    CREATE VIEW materials_with_totals AS
    SELECT
      m.id,
      m.name,
      m.sku,
      m.category,
      m.unit,
      m.cost_price,
      m.sell_price,
      COALESCE(m.unallocated_stock, 0) AS unallocated_stock,
      COALESCE(m.wip_qty, 0)           AS wip_qty,
      (COALESCE(m.unallocated_stock,0) + COALESCE(m.wip_qty,0)) AS stock_qty,
      m.created_at,
      m.updated_at
    FROM materials m;
  `);
}

