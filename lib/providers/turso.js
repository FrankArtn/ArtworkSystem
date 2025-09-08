import { createClient } from "@libsql/client";

export async function getTurso() {
  if (!process.env.TURSO_DATABASE_URL) {
    throw new Error("Missing TURSO_DATABASE_URL");
  }
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}
