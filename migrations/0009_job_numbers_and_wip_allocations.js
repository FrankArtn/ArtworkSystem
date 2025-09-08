// migrations/0009_job_numbers_and_wip_allocations.js
export const id = "0009_job_numbers_and_wip_allocations";

export async function up(query) {
  const addCol = async (sql) => { try { await query(sql); } catch {} };

  // Ensure orders table exists
  const ords = await query(`SELECT name FROM sqlite_master WHERE type='table' AND name='orders'`);
  if (!ords.rows?.length) return;

  // Add job_number on orders (idempotent)
  await addCol(`ALTER TABLE orders ADD COLUMN job_number TEXT`);
  await query(`UPDATE orders SET job_number = COALESCE(job_number, printf('JOB-%06d', id))`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_job_number ON orders(job_number)`);

  // Auto-assign job_number on insert if NULL
  await query(`
    CREATE TRIGGER IF NOT EXISTS trg_orders_jobnumber
    AFTER INSERT ON orders
    WHEN NEW.job_number IS NULL
    BEGIN
      UPDATE orders SET job_number = printf('JOB-%06d', NEW.id) WHERE id = NEW.id;
    END;
  `);

  // Create per-job WIP allocation table
  await query(`
    CREATE TABLE IF NOT EXISTS wip_allocations (
      id INTEGER PRIMARY KEY,
      material_id INTEGER NOT NULL,
      job_number TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK (qty > 0),
      unit_cost REAL,                          -- snapshot of cost at transfer
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(material_id) REFERENCES materials(id),
      FOREIGN KEY(job_number) REFERENCES orders(job_number)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_wip_allocations_mat ON wip_allocations(material_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_wip_allocations_job ON wip_allocations(job_number)`);
}
