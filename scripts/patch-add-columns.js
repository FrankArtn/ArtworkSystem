// scripts/patch-add-columns.js
import { config as load } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closeDb } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
load({ path: path.resolve(__dirname, '../.env.local') });
load({ path: path.resolve(__dirname, '../.env') });

const REQUIRED = [
  { name: 'category',   sql: 'ALTER TABLE materials ADD COLUMN category TEXT' },
  { name: 'unit',       sql: 'ALTER TABLE materials ADD COLUMN unit TEXT' },
  { name: 'cost_price', sql: 'ALTER TABLE materials ADD COLUMN cost_price REAL DEFAULT 0' },
  { name: 'sell_price', sql: 'ALTER TABLE materials ADD COLUMN sell_price REAL DEFAULT 0' },
  { name: 'wip_qty',    sql: 'ALTER TABLE materials ADD COLUMN wip_qty INTEGER DEFAULT 0' },
];

(async () => {
  const colsRes = await query('PRAGMA table_info(materials)');
  const existing = new Set((colsRes.rows || []).map(r => r.name));
  for (const c of REQUIRED) {
    if (!existing.has(c.name)) {
      console.log('Adding column:', c.name);
      await query(c.sql);
    } else {
      console.log('Column exists, skipping:', c.name);
    }
  }
  await query('UPDATE materials SET wip_qty = 0 WHERE wip_qty IS NULL');
  await query('DROP VIEW IF EXISTS materials_with_totals');
  await query(`CREATE VIEW materials_with_totals AS
    SELECT id,name,sku,category,unit,cost_price,sell_price,
           COALESCE(stock_qty,0) AS stock_qty,
           COALESCE(wip_qty,0)  AS wip_qty,
           (COALESCE(stock_qty,0)+COALESCE(wip_qty,0)) AS total_stock,
           created_at,updated_at
    FROM materials`);
  console.log('Patch complete.');
  await closeDb();
})().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
