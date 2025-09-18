// migrations/0017_create_job_images.js
// Create `job_images` table (idempotent). No explicit BEGIN/COMMIT so it works with Turso/libsql over HTTP.

import { query } from '../lib/db.js'; // adjust path if needed

async function tableExists(name) {
  const r = await query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`,
    [name]
  );
  return !!(r.rows && r.rows.length);
}

async function indexExists(name) {
  const r = await query(
    `SELECT name FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1`,
    [name]
  );
  return !!(r.rows && r.rows.length);
}

export async function up() {
  // Create table once
  if (!(await tableExists('job_images'))) {
    await query(`
      CREATE TABLE job_images (
        id           INTEGER PRIMARY KEY,
        job_id       INTEGER NOT NULL,
        object_name  TEXT    NOT NULL,
        filename     TEXT,
        content_type TEXT,
        created_at   TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Optional: helpful index for lookups by job
  if (!(await indexExists('ix_job_images_job_id'))) {
    await query(`CREATE INDEX ix_job_images_job_id ON job_images(job_id);`);
  }
}

export async function down() {
  // Best-effort: drop index then table
  try { await query(`DROP INDEX IF EXISTS ix_job_images_job_id;`); } catch {}
  await query(`DROP TABLE IF EXISTS job_images;`);
}

// Allow running directly: `node migrations/0017_create_job_images.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => {
      console.log('✅ 0017_create_job_images applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err?.message || err);
      process.exit(1);
    });
}
