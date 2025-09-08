// migrations/0008_normalize_material_ids.js
// Normalizes materials.id to INTEGER (auto-increment friendly) and recreates the view.
// Safe to run multiple times; no-ops if ids are already integer PK.

export const id = "0008_normalize_material_ids";

export async function up(query) {
  // FK-heavy rewrite ahead
  await query(`PRAGMA foreign_keys = OFF`);

  // 1) Ensure required columns exist (ignore dup errors)
  const addCol = async (sql) => { try { await query(sql); } catch {} };
  const hasMaterials = await query(`SELECT name FROM sqlite_master WHERE type='table' AND name='materials'`);
  if (!hasMaterials.rows?.length) {
    await query(`PRAGMA foreign_keys = ON`);
    return; // nothing to do
  }

  await addCol(`ALTER TABLE materials ADD COLUMN unallocated_stock INTEGER`);
  await addCol(`ALTER TABLE materials ADD COLUMN wip_qty INTEGER`);
  await addCol(`ALTER TABLE materials ADD COLUMN created_at TEXT`);
  await addCol(`ALTER TABLE materials ADD COLUMN updated_at TEXT`);

  // Backfill timestamps (best-effort)
  try { await query(`UPDATE materials SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)`); } catch {}
  try { await query(`UPDATE materials SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)`); } catch {}

  // Drop the view now to avoid reference issues during rewrite
  await query(`DROP VIEW IF EXISTS materials_with_totals`);

  // 2) If already INTEGER PK and all ids are integer-typed, just recreate view and exit
  const info = await query(`PRAGMA table_info(materials)`);
  const idCol = info.rows?.find(r => r.name === "id");
  const isIntegerPK = idCol && /int/i.test(idCol.type || "") && idCol.pk === 1;
  const nonInt = await query(`SELECT COUNT(*) AS c FROM materials WHERE TYPEOF(id) != 'integer'`);
  const hasNonInt = Number(nonInt.rows?.[0]?.c || 0) > 0;

  if (isIntegerPK && !hasNonInt) {
    await query(`
      CREATE VIEW materials_with_totals AS
      SELECT
        id, name, sku, category, unit, cost_price, sell_price,
        COALESCE(unallocated_stock, 0) AS unallocated_stock,
        COALESCE(wip_qty, 0)          AS wip_qty,
        (COALESCE(unallocated_stock,0) + COALESCE(wip_qty,0)) AS stock_qty,
        created_at, updated_at
      FROM materials
    `);
    await query(`PRAGMA foreign_keys = ON`);
    return;
  }

  // 3) Build id map: keep integer ids; assign new ints for non-integers
  await query(`DROP TABLE IF EXISTS __id_map_materials`);
  await query(`CREATE TEMP TABLE __id_map_materials (old_id TEXT, new_id INTEGER)`);

  await query(`
    WITH m AS (
      SELECT id, created_at, rowid, TYPEOF(id) AS t FROM materials
    ),
    ints AS (
      SELECT id AS old_id, CAST(id AS INTEGER) AS new_id
      FROM m WHERE t = 'integer'
    ),
    max_int AS (
      SELECT COALESCE(MAX(new_id), 0) AS base FROM ints
    ),
    texts AS (
      SELECT id AS old_id,
             ROW_NUMBER() OVER (ORDER BY COALESCE(created_at,''), rowid) AS rn
      FROM m WHERE t != 'integer'
    ),
    mapped_texts AS (
      SELECT old_id, rn + (SELECT base FROM max_int) AS new_id
      FROM texts
    )
    INSERT INTO __id_map_materials(old_id, new_id)
    SELECT old_id, new_id FROM ints
    UNION ALL
    SELECT old_id, new_id FROM mapped_texts
  `);

  // 4) Rewrite materials with INTEGER PRIMARY KEY
  await query(`
    CREATE TABLE materials_int (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      unit TEXT,
      cost_price REAL,
      sell_price REAL,
      unallocated_stock INTEGER DEFAULT 0,
      wip_qty INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  await query(`
    INSERT INTO materials_int (
      id, name, sku, category, unit, cost_price, sell_price,
      unallocated_stock, wip_qty, created_at, updated_at
    )
    SELECT map.new_id, m.name, m.sku, m.category, m.unit, m.cost_price, m.sell_price,
           COALESCE(m.unallocated_stock,0), COALESCE(m.wip_qty,0),
           m.created_at, m.updated_at
      FROM materials m
      JOIN __id_map_materials map
        ON CAST(map.old_id AS TEXT) = CAST(m.id AS TEXT)
  `);

  // 5) Update common FK columns in related tables if present
  const candidateTables = ["bom", "products", "orders", "quote_items", "quotes"];
  const candidateCols = ["material_id", "materials_id"];
  for (const tbl of candidateTables) {
    const exists = await query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`, [tbl]);
    if (!exists.rows?.length) continue;

    const cols = await query(`PRAGMA table_info(${tbl})`);
    const colNames = new Set(cols.rows.map(r => r.name));
    const fkCol = candidateCols.find(c => colNames.has(c));
    if (!fkCol) continue;

    await query(`
      UPDATE ${tbl}
         SET ${fkCol} = (
           SELECT new_id FROM __id_map_materials
            WHERE CAST(old_id AS TEXT) = CAST(${tbl}.${fkCol} AS TEXT)
         )
       WHERE EXISTS (
         SELECT 1 FROM __id_map_materials
          WHERE CAST(old_id AS TEXT) = CAST(${tbl}.${fkCol} AS TEXT)
       )
    `);
  }

  // 6) Swap tables and recreate the view
  await query(`DROP TABLE materials`);
  await query(`ALTER TABLE materials_int RENAME TO materials`);
  await query(`
    CREATE VIEW materials_with_totals AS
    SELECT
      id, name, sku, category, unit, cost_price, sell_price,
      COALESCE(unallocated_stock, 0) AS unallocated_stock,
      COALESCE(wip_qty, 0)          AS wip_qty,
      (COALESCE(unallocated_stock,0) + COALESCE(wip_qty,0)) AS stock_qty,
      created_at, updated_at
    FROM materials
  `);

  await query(`PRAGMA foreign_keys = ON`);
}
