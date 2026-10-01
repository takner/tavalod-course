// Runs before the e2e dev server starts: fresh database + empty mail outbox.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import postgres from "postgres";

const target = process.env.DATABASE_URL;
const url = new URL(target);
const dbName = url.pathname.slice(1);
if (!dbName.endsWith("_e2e")) throw new Error("E2E database name must end with _e2e");
const admin = new URL(target);
admin.pathname = "/postgres";
const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
await sql.unsafe(`drop database if exists "${dbName}" with (force)`);
await sql.unsafe(`create database "${dbName}"`);
await sql.end();
execFileSync(process.execPath, ["scripts/migrate.mjs"], { stdio: "inherit" });
rmSync(".e2e-outbox", { recursive: true, force: true });
