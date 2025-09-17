// migrations/0015_add_sku_unit_columns.js
// Add `sku` and `unit` columns to products if missing.
// No explicit BEGIN/COMMIT so it works with Turso/libsql over HTTP.

import { query } from '../lib/db.js'; // adjust path if needed

async function columnExists(table, col) {
  const info = await query(`PRAGMA table_info(${table})`);
  const cols = new Set((info.rows || []).map(r => r.name));
  return cols.has(col);
}

export async function up() {
  // Add `sku` TEXT if missing
  if (!(await columnExists('products', 'sku'))) {
    await query(`ALTER TABLE products ADD COLUMN sku TEXT;`);
  }

  // Add `unit` TEXT if missing
  if (!(await columnExists('products', 'unit'))) {
    await query(`ALTER TABLE products ADD COLUMN unit TEXT;`);
  }
}

export async function down() {
  // Best-effort: try to drop columns if the engine supports it (SQLite >= 3.35).
  // If not supported, we leave the columns in place (irreversible).
  try {
    if (await columnExists('products', 'sku')) {
      await query(`ALTER TABLE products DROP COLUMN sku;`);
    }
  } catch (_) {
    console.warn('Down migration: DROP COLUMN sku not supported — leaving column in place.');
  }

  try {
    if (await columnExists('products', 'unit')) {
      await query(`ALTER TABLE products DROP COLUMN unit;`);
    }
  } catch (_) {
    console.warn('Down migration: DROP COLUMN unit not supported — leaving column in place.');
  }
}

// Allow running directly: `node migrations/0015_add_sku_unit_columns.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => {
      console.log('✅ 0015_add_sku_unit_columns applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err?.message || err);
      process.exit(1);
    });
}
