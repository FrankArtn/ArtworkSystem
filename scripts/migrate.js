// scripts/migrate.js (only showing the changed/added bits)
import { config as loadEnv } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, closeDb } from "../lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load envs locally; harmless on Render
loadEnv({ path: path.resolve(__dirname, "../.env.local") });
loadEnv({ path: path.resolve(__dirname, "../.env") });

// ⬇️ NEW: run a statement but ignore idempotency errors (duplicate column / already exists)
async function execSafe(sql) {
  try {
    return await query(sql);
  } catch (e) {
    const msg = String(e?.message || "");
    const isDupColumn =
      msg.includes("duplicate column name") ||            // SQLite/libSQL
      msg.includes("already exists") ||                   // generic
      msg.includes('of relation "materials" already exists'); // Postgres wording
    if (isDupColumn) {
      console.log("↪︎ Skipping idempotent stmt:", sql.split("\n")[0]);
      return;
    }
    throw e; // real error → fail
  }
}

async function ensureMigrationsTable() {
  await execSafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT
    )
  `);
}

async function appliedSet() {
  const res = await query(`SELECT id FROM _migrations`);
  return new Set((res.rows || []).map((r) => r.id));
}

async function run() {
  await ensureMigrationsTable();
  const dir = path.join(__dirname, "../migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = await appliedSet();

  for (const f of files) {
    if (done.has(f)) continue;
    const sqlText = fs.readFileSync(path.join(dir, f), "utf8");
    console.log(`Applying ${f}...`);
    const statements = sqlText
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const s of statements) {
      await execSafe(s);
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
