// migrations/0013_quote_items_canonical.js
// Canonicalize quote_items (keep sale_price + cost_price only) and rebuild dependent objects.
// Uses @libsql/client transaction API to avoid "no transaction is active" errors.

import { createClient } from '@libsql/client';

async function namesMap(tx, kinds = ['table','view','trigger']) {
  const inList = kinds.map(k => `'${k}'`).join(',');
  const res = await tx.execute(
    `SELECT name, type FROM sqlite_master WHERE type IN (${inList})`
  );
  const map = new Map();
  for (const row of res.rows ?? []) {
    map.set(row.name, row.type);
  }
  return map;
}

export async function up() {
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN;
  if (!url) throw new Error('Missing TURSO_DATABASE_URL/TURSO_URL');

  const db = createClient({ url, authToken });

  await db.transaction('write', async (tx) => {
    // Discover current objects
    const nm = await namesMap(tx, ['table','view','trigger']);
    const hasQI      = nm.has('quote_items');
    const hasQInew   = nm.has('quote_items_new');
    const hasQItmp   = nm.has('quote_items_oldstyle'); // in case of rollback state
    const hasQTotals = nm.has('quote_totals');

    // Find triggers that mention quote_items
    const trgRes = await tx.execute(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND sql LIKE '%quote_items%'`
    );
    const triggersToDrop = (trgRes.rows ?? []).map(r => r.name);
    const hadTriggers = triggersToDrop.length > 0;

    // 1) Drop dependent view + triggers up-front
    if (hasQTotals) {
      await tx.execute(`DROP VIEW IF EXISTS quote_totals;`);
    }
    for (const t of triggersToDrop) {
      await tx.execute(`DROP TRIGGER IF EXISTS ${t};`);
    }

    // 2) If a previous partial run left only quote_items_new, promote it
    if (hasQInew && !hasQI) {
      await tx.execute(`ALTER TABLE quote_items_new RENAME TO quote_items;`);
    } else {
      // Clean up staging table (idempotent)
      await tx.execute(`DROP TABLE IF EXISTS quote_items_new;`);

      // 3) Create canonical staging table
      await tx.execute(`
        CREATE TABLE quote_items_new (
          id         INTEGER PRIMARY KEY,
          quote_id   INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          qty        INTEGER NOT NULL,
          dims_json  TEXT,
          cost_price REAL    NOT NULL DEFAULT 0,
          sale_price REAL    NOT NULL DEFAULT 0,
          created_at TEXT,
          updated_at TEXT
        );
      `);

      // 4) Choose best source and copy
      let source = null;
      if (hasQI) source = 'quote_items';
      else if (hasQItmp) source = 'quote_items_oldstyle';

      if (source) {
        await tx.execute(`
          INSERT INTO quote_items_new (
            id, quote_id, product_id, qty, dims_json, cost_price, sale_price, created_at, updated_at
          )
          SELECT
            id,
            quote_id,
            product_id,
            qty,
            dims_json,
            COALESCE(cost_price,  cost,  0) AS cost_price,
            COALESCE(sale_price,  price, 0) AS sale_price,
            created_at,
            updated_at
          FROM ${source};
        `);
      }

      // 5) Swap in canonical table
      if (hasQI) {
        await tx.execute(`DROP TABLE quote_items;`);
      }
      await tx.execute(`ALTER TABLE quote_items_new RENAME TO quote_items;`);
    }

    // 6) Indexes
    await tx.execute(`CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id   ON quote_items(quote_id);`);
    await tx.execute(`CREATE INDEX IF NOT EXISTS idx_quote_items_product_id ON quote_items(product_id);`);

    // 7) Recreate dependent view against canonical columns
    await tx.execute(`
      CREATE VIEW quote_totals AS
      SELECT
        q.id AS quote_id,
        COALESCE(SUM(COALESCE(qi.cost_price,0) * COALESCE(qi.qty,0)), 0) AS subtotal_cost,
        COALESCE(SUM(COALESCE(qi.sale_price,0) * COALESCE(qi.qty,0)), 0) AS total_price,
        CASE
          WHEN COALESCE(SUM(COALESCE(qi.cost_price,0) * COALESCE(qi.qty,0)),0) > 0
          THEN (
            COALESCE(SUM(COALESCE(qi.sale_price,0) * COALESCE(qi.qty,0)),0)
            - COALESCE(SUM(COALESCE(qi.cost_price,0) * COALESCE(qi.qty,0)),0)
          ) / COALESCE(SUM(COALESCE(qi.cost_price,0) * COALESCE(qi.qty,0)),0) * 100.0
          ELSE 0
        END AS markup_pct
      FROM quotes q
      LEFT JOIN quote_items qi ON qi.quote_id = q.id
      GROUP BY q.id;
    `);

    // 8) (Optional) Recreate a trigger if one existed before (canonical version)
    if (hadTriggers) {
      await tx.execute(`
        CREATE TRIGGER trg_quote_approve_creates_orders_per_item
        AFTER UPDATE OF status ON quotes
        WHEN NEW.status IN ('accepted','won') AND (OLD.status IS NOT NEW.status)
        BEGIN
          INSERT INTO orders (quote_id, status, job_number)
          SELECT
            NEW.id,
            'open',
            printf('JOB-%06d-%03d', NEW.id, qi.id)
          FROM quote_items qi
          WHERE qi.quote_id = NEW.id
            AND NOT EXISTS (
              SELECT 1 FROM orders o
              WHERE o.quote_id = NEW.id
                AND o.job_number = printf('JOB-%06d-%03d', NEW.id, qi.id)
            );
        END;
      `);
    }
  });

  // No manual COMMIT; the transaction scope handles it.
}

export async function down() {
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN;
  if (!url) throw new Error('Missing TURSO_DATABASE_URL/TURSO_URL');
  const db = createClient({ url, authToken });

  await db.transaction('write', async (tx) => {
    await tx.execute(`DROP VIEW IF EXISTS quote_totals;`);
    await tx.execute(`DROP TRIGGER IF EXISTS trg_quote_approve_creates_orders_per_item;`);

    await tx.execute(`
      CREATE TABLE quote_items_oldstyle (
        id         INTEGER PRIMARY KEY,
        quote_id   INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        qty        INTEGER NOT NULL,
        dims_json  TEXT,
        cost       REAL    NOT NULL DEFAULT 0,
        price      REAL    NOT NULL DEFAULT 0,
        sale_price REAL,
        cost_price REAL,
        created_at TEXT,
        updated_at TEXT
      );
    `);

    // Copy back if canonical exists
    const nm = await namesMap(tx, ['table']);
    if (nm.has('quote_items')) {
      await tx.execute(`
        INSERT INTO quote_items_oldstyle (
          id, quote_id, product_id, qty, dims_json, cost, price, sale_price, cost_price, created_at, updated_at
        )
        SELECT
          id, quote_id, product_id, qty, dims_json,
          COALESCE(cost_price,0) AS cost,
          COALESCE(sale_price,0) AS price,
          sale_price,
          cost_price,
          created_at, updated_at
        FROM quote_items;
      `);
      await tx.execute(`DROP TABLE quote_items;`);
    }

    await tx.execute(`ALTER TABLE quote_items_oldstyle RENAME TO quote_items;`);
    await tx.execute(`CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id   ON quote_items(quote_id);`);
    await tx.execute(`CREATE INDEX IF NOT EXISTS idx_quote_items_product_id ON quote_items(product_id);`);

    // Recreate an old-style view (cost/price)
    await tx.execute(`
      CREATE VIEW quote_totals AS
      SELECT
        q.id AS quote_id,
        COALESCE(SUM(COALESCE(qi.cost,0) * COALESCE(qi.qty,0)), 0) AS subtotal_cost,
        COALESCE(SUM(COALESCE(qi.price,0) * COALESCE(qi.qty,0)), 0) AS total_price,
        CASE
          WHEN COALESCE(SUM(COALESCE(qi.cost,0) * COALESCE(qi.qty,0)),0) > 0
          THEN (
            COALESCE(SUM(COALESCE(qi.price,0) * COALESCE(qi.qty,0)),0)
            - COALESCE(SUM(COALESCE(qi.cost,0) * COALESCE(qi.qty,0)),0)
          ) / COALESCE(SUM(COALESCE(qi.cost,0) * COALESCE(qi.qty,0)),0) * 100.0
          ELSE 0
        END AS markup_pct
      FROM quotes q
      LEFT JOIN quote_items qi ON qi.quote_id = q.id
      GROUP BY q.id;
    `);
  });
}
