// lib/db.js
import { createClient } from "@libsql/client";

let _cached;

export async function getDb() {
  if (_cached) return _cached;

  // For now we only enable Turso to avoid bundling pg/better-sqlite3.
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("Missing TURSO_DATABASE_URL");
  _cached = createClient({ url, authToken });
  return _cached;
}

// Uniform query interface so the rest of your app doesn't change later
export async function query(sql, params = []) {
  const db = await getDb();
  return db.execute(sql, params);
}

export async function closeDb() {
  _cached = null;
}
