// migrations/0016_add_dims_used_transport.js
// Add dimensional fields to quote_items, 'used' to materials, and 'transportation_cost' to quotes.
// No explicit BEGIN/COMMIT so it works with Turso/libsql over HTTP.

import { query } from '../lib/db.js'; // adjust path if needed

async function columnExists(table, col) {
  const info = await query(`PRAGMA table_info(${table})`);
  const cols = new Set((info.rows || []).map(r => r.name));
  return cols.has(col);
}

export async function up() {
  // --- quote_items: length_m, width_m, area_sqm (all REAL) ---
  if (!(await columnExists('quote_items', 'length_m'))) {
    await query(`ALTER TABLE quote_items ADD COLUMN length_m REAL;`);
  }
  if (!(await columnExists('quote_items', 'width_m'))) {
    await query(`ALTER TABLE quote_items ADD COLUMN width_m REAL;`);
  }
  if (!(await columnExists('quote_items', 'area_sqm'))) {
    await query(`ALTER TABLE quote_items ADD COLUMN area_sqm REAL;`);
  }

  // --- materials: used (REAL DEFAULT 0) ---
  if (!(await columnExists('materials', 'used'))) {
    await query(`ALTER TABLE materials ADD COLUMN used REAL DEFAULT 0;`);
  }

  // --- quotes: transportation_cost (REAL DEFAULT 0) ---
  if (!(await columnExists('quotes', 'transportation_cost'))) {
    await query(`ALTER TABLE quotes ADD COLUMN transportation_cost REAL DEFAULT 0;`);
  }
}

export async function down() {
  // Best-effort: try to drop columns if the engine supports it (SQLite >= 3.35).
  // If not supported, we leave the columns in place (irreversible).
  try {
    if (await columnExists('quote_items', 'length_m')) {
      await query(`ALTER TABLE quote_items DROP COLUMN length_m;`);
    }
  } catch (_) {
    console.warn('Down migration: DROP COLUMN quote_items.length_m not supported — leaving column in place.');
  }

  try {
    if (await columnExists('quote_items', 'width_m')) {
      await query(`ALTER TABLE quote_items DROP COLUMN width_m;`);
    }
  } catch (_) {
    console.warn('Down migration: DROP COLUMN quote_items.width_m not supported — leaving column in place.');
  }

  try {
    if (await columnExists('quote_items', 'area_sqm')) {
      await query(`ALTER TABLE quote_items DROP COLUMN area_sqm;`);
    }
  } catch (_) {
    console.warn('Down migration: DROP COLUMN quote_items.area_sqm not supported — leaving column in place.');
  }

  try {
    if (await columnExists('materials', 'used')) {
      await query(`ALTER TABLE materials DROP COLUMN used;`);
    }
  } catch (_) {
    console.warn('Down migration: DROP COLUMN materials.used not supported — leaving column in place.');
  }

  try {
    if (await columnExists('quotes', 'transportation_cost')) {
      await query(`ALTER TABLE quotes DROP COLUMN transportation_cost;`);
    }
  } catch (_) {
    console.warn('Down migration: DROP COLUMN quotes.transportation_cost not supported — leaving column in place.');
  }
}

// Allow running directly: `node migrations/0016_add_dims_used_transport.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => {
      console.log('✅ 0016_add_dims_used_transport applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err?.message || err);
      process.exit(1);
    });
}
