// lib/db.js
let _cached;

export async function getDb() {
  if (_cached) return _cached;

  const provider = process.env.DB_PROVIDER || "turso";

  if (provider === "turso") {
    const { getTurso } = await import("./providers/turso.js");
    _cached = await getTurso();
  } else if (provider === "postgres") {
    // only works if you later `npm install pg`
    const { getPostgres } = await import("./providers/postgres.js");
    _cached = await getPostgres();
  } else if (provider === "sqlite") {
    // only works if you later `npm install better-sqlite3`
    const { getSqlite } = await import("./providers/sqlite.js");
    _cached = await getSqlite();
  } else {
    throw new Error(`Unknown DB_PROVIDER: ${provider}`);
  }

  return _cached;
}

export async function query(sql, params = []) {
  const db = await getDb();
  return db.execute(sql, params);
}

export async function closeDb() {
  if (_cached?.close) await _cached.close();
  _cached = null;
}
