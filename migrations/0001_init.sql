-- NO vendor-specific types; stick to ANSI-compatible where possible
CREATE TABLE IF NOT EXISTS materials (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  sku          TEXT UNIQUE,
  category     TEXT,
  unit         TEXT,                  -- e.g., sheet, roll, piece
  cost_price   REAL DEFAULT 0,        -- use NUMERIC/REAL to stay portable
  sell_price   REAL DEFAULT 0,
  stock_qty    INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_materials_name ON materials(name);
CREATE INDEX IF NOT EXISTS idx_materials_sku  ON materials(sku);
