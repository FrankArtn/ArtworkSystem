// migrations/0014_orders_quote_item_unique.js
// De-dupe any duplicate orders per quote_item_id, then add a unique index.
// No explicit BEGIN/COMMIT so it works with Turso/libsql over HTTP.

import { query } from '../lib/db.js'; // adjust path if needed

export async function up() {
  // 1) Remove duplicates, keep the oldest (smallest id)
  await query(`
    WITH d AS (
      SELECT quote_item_id, MIN(id) AS keep_id
      FROM orders
      WHERE quote_item_id IS NOT NULL
      GROUP BY quote_item_id
      HAVING COUNT(*) > 1
    )
    DELETE FROM orders
    WHERE quote_item_id IN (SELECT quote_item_id FROM d)
      AND id NOT IN (SELECT keep_id FROM d);
  `);

  // 2) Create unique index (enforces one job per line item)
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_quote_item
    ON orders(quote_item_id)
    WHERE quote_item_id IS NOT NULL;
  `);
}

export async function down() {
  await query(`DROP INDEX IF EXISTS ux_orders_quote_item;`);
}

// Allow running directly: `node migrations/0014_orders_quote_item_unique.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => {
      console.log('✅ 0014_orders_quote_item_unique applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err?.message || err);
      process.exit(1);
    });
}
