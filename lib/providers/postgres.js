// lib/providers/postgres.js
export async function getPostgres() {
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
