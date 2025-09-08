-- Add unallocated_stock (safe if it already exists thanks to your execSafe)
ALTER TABLE materials ADD COLUMN unallocated_stock INTEGER DEFAULT 0;

-- Null-proof the new column
UPDATE materials SET unallocated_stock = 0 WHERE unallocated_stock IS NULL;

-- Recreate a null-safe view that COMPUTES stock_qty (no stored total)
DROP VIEW IF EXISTS materials_with_totals;
CREATE VIEW materials_with_totals AS
SELECT
  id, name, sku, category, unit, cost_price, sell_price,
  COALESCE(unallocated_stock, 0) AS unallocated_stock,
  COALESCE(wip_qty, 0)          AS wip_qty,
  (COALESCE(unallocated_stock, 0) + COALESCE(wip_qty, 0)) AS stock_qty,
  created_at, updated_at
FROM materials;
