// scripts/migrate.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closeDb } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT
    )
  `);
}

async function appliedSet() {
  const res = await query(`SELECT id FROM _migrations`);
  const ids = new Set((res.rows || []).map(r => r.id));
  return ids;
}

async function run() {
  await ensureMigrationsTable();
  const dir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const done = await appliedSet();

  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`Applying ${f}...`);
    // naive split on semicolons; acceptable for simple schema
    const statements = sql.split(/;\s*$/m).map(s => s.trim()).filter(Boolean);
    for (const s of statements) {
      await query(s);
    }
    await query(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`, [
      f,
      new Date().toISOString(),
    ]);
    console.log(`✔ ${f} applied`);
  }
  await closeDb();
}

run().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
