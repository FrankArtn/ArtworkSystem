// scripts/seed.js
import { query, closeDb } from '../lib/db.js';
import { randomUUID } from 'crypto';

async function run() {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO materials (id, name, sku, category, unit, cost_price, sell_price, stock_qty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), 'Acrylic Sheet 3mm', 'ACR-3MM-CLR', 'Acrylic', 'sheet', 12.5, 25.0, 10, now, now]
  );
  console.log('Seeded example material.');
  await closeDb();
}
run().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
