import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

// Prefer .env.local; fall back to .env if needed
const envLocal = path.resolve(process.cwd(), ".env.local");
const envFile = fs.existsSync(envLocal) ? envLocal : path.resolve(process.cwd(), ".env");
dotenv.config({ path: envFile });

// (optional) quick sanity log — comment out later
if (!process.env.TURSO_DATABASE_URL) {
  console.error("Missing TURSO_DATABASE_URL. Loaded from:", envFile);
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});


const stmts = [
  `PRAGMA foreign_keys = ON;`,
  `CREATE TABLE IF NOT EXISTS materials(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,                -- "m2" | "lm" | "ea"
    cost_per_unit REAL NOT NULL,
    reorder_level REAL DEFAULT 0,
    on_hand REAL NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS products(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_setup_cost REAL NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS bom(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES materials(id),
    qty_per_unit REAL NOT NULL,
    waste_pct REAL NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS quotes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT,
    subtotal_cost REAL NOT NULL,
    markup_pct REAL NOT NULL,
    tax_rate REAL NOT NULL,
    total_price REAL NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS quote_items(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty INTEGER NOT NULL,
    dims_json TEXT,
    cost REAL NOT NULL,
    price REAL NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL REFERENCES quotes(id),
    status TEXT NOT NULL,
    completed_at TEXT
  );`,
  `INSERT OR IGNORE INTO materials (sku,name,unit,cost_per_unit,reorder_level,on_hand) VALUES
    ('ACM3MM','ACM Panel 3mm','m2',45,10,100),
    ('VINYL-MATT','Vinyl Matt','m2',12,20,200),
    ('LAM-MATT','Laminate Matt','m2',8,20,200),
    ('RIVET','Rivet','ea',0.1,50,1000);`,
  `INSERT OR IGNORE INTO products (name, base_setup_cost) VALUES ('ACM Panel', 25);`,
  `INSERT OR IGNORE INTO bom (product_id, material_id, qty_per_unit, waste_pct)
    SELECT p.id, m.id,
      CASE m.sku WHEN 'ACM3MM' THEN 1.0 WHEN 'VINYL-MATT' THEN 1.0 WHEN 'LAM-MATT' THEN 1.0 WHEN 'RIVET' THEN 6.0 END,
      CASE m.sku WHEN 'VINYL-MATT' THEN 0.05 WHEN 'LAM-MATT' THEN 0.05 ELSE 0 END
    FROM products p, materials m
    WHERE p.name='ACM Panel';`
];

for (const sql of stmts) {
  await db.execute(sql);
}
console.log("DB initialized ✅");
