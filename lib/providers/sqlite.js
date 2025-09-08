// lib/providers/sqlite.js
export async function getSqlite() {
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
        return {
          rows: [],
          changes: info.changes,
          lastInsertRowid: info.lastInsertRowid,
        };
      }
    },
    close() {
      db.close();
    },
  };
}
