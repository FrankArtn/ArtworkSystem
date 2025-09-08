DROP VIEW IF EXISTS materials_with_totals;
CREATE VIEW materials_with_totals AS
SELECT
  id, name, sku, category, unit, cost_price, sell_price,
  COALESCE(stock_qty, 0) AS stock_qty,
  COALESCE(wip_qty, 0)  AS wip_qty,
  (COALESCE(stock_qty, 0) + COALESCE(wip_qty, 0)) AS total_stock,
  created_at, updated_at
FROM materials;
