export const id = "0012_quote_items_and_approval";

export async function up(query) {
  const add = async (sql) => { try { await query(sql); } catch {} };
  const tableExists = async (name) => {
    const r = await query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`, [name]);
    return !!r.rows?.length;
  };

  if (!(await tableExists("quotes"))) return;
  if (!(await tableExists("quote_items"))) return;
  if (!(await tableExists("orders"))) return;

  // Ensure quote_items has qty, sale_price, cost_price, timestamps
  await add(`ALTER TABLE quote_items ADD COLUMN qty REAL`);
  await add(`ALTER TABLE quote_items ADD COLUMN sale_price REAL`);
  await add(`ALTER TABLE quote_items ADD COLUMN cost_price REAL`);
  await add(`ALTER TABLE quote_items ADD COLUMN created_at TEXT`);
  await add(`ALTER TABLE quote_items ADD COLUMN updated_at TEXT`);
  await query(`
    UPDATE quote_items
       SET qty        = COALESCE(qty, 1),
           created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
           updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
  `);

  // Optional: record which item produced which job
  await add(`ALTER TABLE orders ADD COLUMN quote_item_id INTEGER`);
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_quote_item_id ON orders(quote_item_id)`);

  // A running subtotal view for quotes (sum of sale_price * qty)
  await query(`
    CREATE VIEW IF NOT EXISTS quote_totals AS
    SELECT
      q.id AS quote_id,
      SUM(COALESCE(qi.sale_price,0) * COALESCE(qi.qty,1)) AS subtotal
    FROM quotes q
    LEFT JOIN quote_items qi ON qi.quote_id = q.id
    GROUP BY q.id
  `);

  // Touch quotes.updated_at when items change (keeps lists fresh)
  await query(`
    CREATE TRIGGER IF NOT EXISTS trg_quote_items_touch_quote
    AFTER INSERT ON quote_items
    BEGIN
      UPDATE quotes SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.quote_id;
    END;
  `);
  await query(`DROP TRIGGER IF EXISTS trg_quote_items_touch_quote_upd`);
  await query(`
    CREATE TRIGGER IF NOT EXISTS trg_quote_items_touch_quote_upd
    AFTER UPDATE ON quote_items
    BEGIN
      UPDATE quotes SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.quote_id;
    END;
  `);
  await query(`DROP TRIGGER IF EXISTS trg_quote_items_touch_quote_del`);
  await query(`
    CREATE TRIGGER IF NOT EXISTS trg_quote_items_touch_quote_del
    AFTER DELETE ON quote_items
    BEGIN
      UPDATE quotes SET updated_at=CURRENT_TIMESTAMP WHERE id=OLD.quote_id;
    END;
  `);

  // Replace the old "accept creates one order" trigger with "approve creates one order per item"
  await query(`DROP TRIGGER IF EXISTS trg_quote_accept_creates_order`);
  await query(`
    CREATE TRIGGER IF NOT EXISTS trg_quote_approve_creates_orders_per_item
    AFTER UPDATE OF status ON quotes
    WHEN (NEW.status IN ('approved','accepted','won'))
    BEGIN
      INSERT INTO orders (quote_id, quote_item_id, status, created_at, updated_at)
      SELECT NEW.id, qi.id, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM quote_items qi
      WHERE qi.quote_id = NEW.id
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.quote_item_id = qi.id);
    END;
  `);
}
