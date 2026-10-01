// Applies pending SQL migrations from ./drizzle. Used locally (npm run db:migrate) and by the
// production `migrate` service. Migrations are forward-only and additive (expand/contract).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: process.env.MIGRATIONS_DIR ?? "./drizzle" });
  console.log("migrations applied");
} catch (err) {
  console.error("migration failed:", err);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
