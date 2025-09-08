// migrations/0010_quotes_numbers_and_accept_flow.js
export const id = "0010_quotes_numbers_and_accept_flow";

export async function up(query) {
  const add = async (sql) => { try { await query(sql); } catch {} };
  const tableExists = async (name) => {
    const r = await query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`, [name]);
    return !!r.rows?.length;
  };

  const hasQuotes = await tableExists("quotes");
  const hasOrders = await tableExists("orders");
  if (!hasQuotes || !hasOrders) return;

  // --- QUOTES: columns ---
  await add(`ALTER TABLE quotes ADD COLUMN quote_number TEXT`);
  await add(`ALTER TABLE quotes ADD COLUMN status TEXT`);
  await add(`ALTER TABLE quotes ADD COLUMN created_at TEXT`);
  await add(`ALTER TABLE quotes ADD COLUMN updated_at TEXT`);

  // Backfill sensible defaults
  await query(`
    UPDATE quotes
       SET status     = COALESCE(status, 'draft'),
           created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
           updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
  `);

  // Backfill missing quote_number
  await query(`
    UPDATE quotes
       SET quote_number = printf('QUO-%06d', id),
           updated_at   = CURRENT_TIMESTAMP
     WHERE quote_number IS NULL OR TRIM(quote_number) = ''
  `);

  // Unique quote_number
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number)`);

  // Auto-assign QUO-000123 on insert
  await query(`
    CREATE TRIGGER IF NOT EXISTS trg_quotes_number
    AFTER INSERT ON quotes
    WHEN NEW.quote_number IS NULL
    BEGIN
      UPDATE quotes
         SET quote_number = printf('QUO-%06d', NEW.id),
             updated_at   = CURRENT_TIMESTAMP
       WHERE id = NEW.id;
    END;
  `);

  // --- ORDERS: columns ---
  await add(`ALTER TABLE orders ADD COLUMN job_number TEXT`);
  await add(`ALTER TABLE orders ADD COLUMN status TEXT`);
  await add(`ALTER TABLE orders ADD COLUMN created_at TEXT`);
  await add(`ALTER TABLE orders ADD COLUMN updated_at TEXT`);

  // Backfill sensible defaults
  await query(`
    UPDATE orders
       SET status     = COALESCE(status, 'open'),
           created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
           updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
  `);

  // Backfill missing job_number
  await query(`
    UPDATE orders
       SET job_number = printf('JOB-%06d', id),
           updated_at = CURRENT_TIMESTAMP
     WHERE job_number IS NULL OR TRIM(job_number) = ''
  `);

  // Keep job_number unique
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_job_number ON orders(job_number)`);

  // Ensure there is NO uniqueness on quote_id (allow many orders per quote)
  await query(`DROP INDEX IF EXISTS idx_orders_quote_id`);

  // Auto-assign JOB-000123 on insert
  await query(`
    CREATE TRIGGER IF NOT EXISTS trg_orders_jobnumber
    AFTER INSERT ON orders
    WHEN NEW.job_number IS NULL
    BEGIN
      UPDATE orders
         SET job_number = printf('JOB-%06d', NEW.id),
             updated_at = CURRENT_TIMESTAMP
       WHERE id = NEW.id;
    END;
  `);

  // Accept flow: when a quote becomes accepted/won, create an order IF none exists yet.
  // (You can still create additional orders for the same quote via your app later.)
  await query(`
    CREATE TRIGGER IF NOT EXISTS trg_quote_accept_creates_order
    AFTER UPDATE OF status ON quotes
    WHEN (NEW.status IN ('accepted','won'))
      AND NOT EXISTS (SELECT 1 FROM orders WHERE quote_id = NEW.id)
    BEGIN
      INSERT INTO orders (quote_id, status, created_at, updated_at)
      VALUES (NEW.id, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END;
  `);
}
