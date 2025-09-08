-- Add timestamp columns (no expression defaults allowed in SQLite)
ALTER TABLE materials ADD COLUMN created_at TEXT;
ALTER TABLE materials ADD COLUMN updated_at TEXT;

-- Backfill existing rows so queries don't hit NULL
UPDATE materials
SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP);

UPDATE materials
SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);

-- Recreate the view so it includes the new columns and remains null-safe
DROP VIEW IF EXISTS materials_with_totals;
CREATE VIEW materials_with_totals AS
SELECT
  id, name, sku, category, unit, cost_price, sell_price,
  COALESCE(stock_qty, 0) AS stock_qty,
  COALESCE(wip_qty, 0)  AS wip_qty,
  (COALESCE(stock_qty, 0) + COALESCE(wip_qty, 0)) AS total_stock,
  created_at, updated_at
FROM materials;
