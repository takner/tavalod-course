import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as { tavalodSql?: postgres.Sql; tavalodDb?: Database };

function create(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  globalForDb.tavalodSql = client;
  return drizzle(client, { schema });
}

/** Lazily-created singleton (survives dev hot reloads). */
export function getDb(): Database {
  globalForDb.tavalodDb ??= create();
  return globalForDb.tavalodDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.tavalodSql?.end({ timeout: 5 });
  globalForDb.tavalodSql = undefined;
  globalForDb.tavalodDb = undefined;
}

export { schema };
