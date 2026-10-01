import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./env";

/** Recreates the test schema from scratch and applies all migrations once per run. */
export default async function setup() {
  if (!/_test\b/.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error("Refusing to run integration tests against a database whose name does not end in _test");
  }
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await sql.end();
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
