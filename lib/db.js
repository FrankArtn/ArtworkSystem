// lib/db.js

let _cached;

// Helper to know which provider we’re on
function provider() {
  return process.env.DB_PROVIDER || "turso";
}

async function getTurso() {
  const { createClient } = await import("@libsql/client");
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

async function getPostgres() {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return {
    async execute(sql, params = []) {
      const res = await client.query(sql, params);
      return { rows: res.rows };
    },
    async close() {
      await client.end();
    },
  };
}

async function getSqlite() {
  const Database = (await import("better-sqlite3")).default;
  const file = process.env.SQLITE_PATH || "./dev.sqlite";
  const db = new Database(file);
  return {
    execute(sql, params = []) {
      const stmt = db.prepare(sql);
      if (/^\s*(select|with)\b/i.test(sql)) {
        return { rows: stmt.all(params) };
      } else {
        const info = stmt.run(params);
        return { rows: [], changes: info.changes, lastInsertRowid: info.lastInsertRowid };
      }
    },
    close() {
      db.close();
    },
  };
}

export async function getDb() {
  if (_cached) return _cached;
  const p = provider();
  if (p === "turso") _cached = await getTurso();
  else if (p === "postgres") _cached = await getPostgres();
  else if (p === "sqlite") _cached = await getSqlite();
  else throw new Error(`Unknown DB_PROVIDER: ${p}`);
  return _cached;
}

// Convenience wrapper
export async function query(sql, params = []) {
  const db = await getDb();
  return db.execute(sql, params);
}

// Reset cache (optional, for hot reloads or tests)
export async function closeDb() {
  if (_cached?.close) await _cached.close();
  _cached = null;
}
