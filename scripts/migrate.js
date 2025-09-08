// scripts/migrate.js
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config({ path: ".env" });

import { query } from "../lib/db.js";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    )
  `);
}

async function getAppliedIds() {
  const { rows } = await query(`SELECT id FROM _migrations`);
  return new Set(rows.map(r => r.id));
}

async function runMigration(file) {
  const url = pathToFileURL(join(MIGRATIONS_DIR, file)).href;
  const mod = await import(url);
  if (!mod || typeof mod.up !== "function") {
    throw new Error(`Migration ${file} does not export 'up'`);
  }
  const migId = mod.id || file.replace(/\.[mc]?js$/, "");
  console.log(`→ Running ${migId} (${file})...`);
  const t0 = Date.now();
  await mod.up(query);
  await query(`INSERT OR REPLACE INTO _migrations (id, applied_at) VALUES (?, CURRENT_TIMESTAMP)`, [migId]);
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`✓ Done ${migId} in ${dt}s`);
}

(async () => {
  try {
    console.log(`[migrate] DB URL: ${process.env.TURSO_DATABASE_URL ? "set" : "missing"} | Provider: ${process.env.DB_PROVIDER || "unknown"}`);
    await ensureMigrationsTable();

    // Find migration files
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => /\.m?js$/i.test(f))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

    if (files.length === 0) {
      console.log("[migrate] No migration files found.");
      process.exit(0);
    }

    const applied = await getAppliedIds();
    const pending = files.filter(f => {
      const id = f.replace(/\.[mc]?js$/, "");
      return !applied.has(id);
    });

    console.log(`[migrate] Found ${files.length} file(s); ${applied.size} applied; ${pending.length} pending.`);
    if (pending.length === 0) {
      console.log("[migrate] Nothing to do.");
      process.exit(0);
    }

    for (const f of pending) {
      await runMigration(f);
    }

    console.log("[migrate] All pending migrations applied.");
    process.exit(0);
  } catch (err) {
    console.error("[migrate] FAILED:", err);
    process.exit(1);
  }
})();
