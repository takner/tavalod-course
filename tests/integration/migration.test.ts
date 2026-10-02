import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { computeBalances } from "@/domain/ledger";
import { loadGroupLedger } from "@/server/ledger";
import { TEST_DATABASE_URL } from "./env";

/**
 * Phase-1 data must survive the phase-2 migrations unchanged: build a database at the phase-1
 * schema (migrations 0000–0002), fill it with phase-1 style rows, apply everything, compare.
 */
const PHASE1_MIGRATIONS = 3;
const dbName = "tavalod_migcheck_test";
const adminUrl = new URL(TEST_DATABASE_URL);
const targetUrl = new URL(TEST_DATABASE_URL);
targetUrl.pathname = `/${dbName}`;

const tmp = mkdtempSync(path.join(tmpdir(), "tavalod-mig-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function phase1Folder(): string {
  const dir = path.join(tmp, "phase1");
  cpSync("drizzle", dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.slice(0, PHASE1_MIGRATIONS);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

describe("migration on a database with phase-1 data", () => {
  it("keeps balances, expenses, settlements and history intact", async () => {
    const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
    await admin.unsafe(`drop database if exists ${dbName} with (force)`);
    await admin.unsafe(`create database ${dbName}`);
    await admin.end();

    const sql = postgres(targetUrl.toString(), { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(sql), { migrationsFolder: phase1Folder() });

      // ── phase-1 data written with phase-1 columns only ──
      const [u1] = await sql`insert into users (email, name) values ('a@x.test', 'علی') returning id`;
      const [u2] = await sql`insert into users (email, name) values ('b@x.test', 'سارا') returning id`;
      const [g] = await sql`insert into groups (name, created_by) values ('قدیمی', ${u1.id}) returning id`;
      const [m1] = await sql`insert into group_members (group_id, user_id, display_name, role) values (${g.id}, ${u1.id}, 'علی', 'owner') returning id`;
      const [m2] = await sql`insert into group_members (group_id, user_id, display_name) values (${g.id}, ${u2.id}, 'سارا') returning id`;
      const [m3] = await sql`insert into group_members (group_id, display_name) values (${g.id}, 'مهمان') returning id`;
      const [ev] = await sql`insert into events (group_id, title, type, status, start_date, created_by) values (${g.id}, 'سفر', 'trip', 'active', '2026-09-01', ${u1.id}) returning id`;
      await sql`insert into event_participants (event_id, member_id, status) values (${ev.id}, ${m1.id}, 'going'), (${ev.id}, ${m2.id}, 'invited')`;
      await sql.begin(async (tx) => {
        const [e] = await tx`insert into expenses (group_id, event_id, title, category, total_amount, date, split_type, created_by)
          values (${g.id}, ${ev.id}, 'ویلا', 'accommodation', 900000, '2026-09-01', 'equal', ${u1.id}) returning id`;
        await tx`insert into expense_payers (expense_id, member_id, amount) values (${e.id}, ${m1.id}, 900000)`;
        await tx`insert into expense_shares (expense_id, member_id, amount) values (${e.id}, ${m1.id}, 300000), (${e.id}, ${m2.id}, 300000), (${e.id}, ${m3.id}, 300000)`;
        await tx`insert into audit_log (group_id, entity_type, entity_id, action, actor_id) values (${g.id}, 'expense', ${e.id}, 'create', ${u1.id})`;
      });
      await sql.begin(async (tx) => {
        const [s] = await tx`insert into settlements (group_id, from_member_id, to_member_id, amount, status, created_by)
          values (${g.id}, ${m2.id}, ${m1.id}, 100000, 'confirmed', ${u2.id}) returning id`;
        await tx`insert into settlement_allocations (settlement_id, event_id, amount) values (${s.id}, ${ev.id}, 100000)`;
      });
      const before = await sql`select (select count(*) from expenses) e, (select count(*) from settlements) s, (select count(*) from audit_log) a, (select count(*) from event_participants) p`;

      // ── apply all migrations ──
      await migrate(drizzle(sql), { migrationsFolder: "drizzle" });

      const db = drizzle(sql, { schema });
      const ledger = await loadGroupLedger(db as never, g.id);
      const balances = computeBalances(ledger.expenses, ledger.settlements);
      expect(balances.get(m1.id)).toBe(500_000n);
      expect(balances.get(m2.id)).toBe(-200_000n);
      expect(balances.get(m3.id)).toBe(-300_000n);

      const after = await sql`select (select count(*) from expenses) e, (select count(*) from settlements) s, (select count(*) from audit_log) a, (select count(*) from event_participants) p`;
      expect(after).toEqual(before);
      const [defaults] = await sql`select purpose, space_id from settlements limit 1`;
      expect(defaults).toEqual({ purpose: "settle", space_id: null });
      const [evAfter] = await sql`select timezone, cake_adult_grams, starts_at from events where id = ${ev.id}`;
      expect(evAfter).toEqual({ timezone: "Asia/Tehran", cake_adult_grams: 150, starts_at: null });
      const parts = await sql`select status, adult_companions from event_participants order by status`;
      expect(parts.map((p) => p.status).sort()).toEqual(["going", "invited"]);

      // Phase-1 style writes still work against the new schema (rollback compatibility of old code paths).
      await sql.begin(async (tx) => {
        const [e] = await tx`insert into expenses (group_id, title, category, total_amount, date, split_type, created_by)
          values (${g.id}, 'قدیمی‌نویس', 'food', 1000, '2026-10-01', 'equal', ${u1.id}) returning id`;
        await tx`insert into expense_payers (expense_id, member_id, amount) values (${e.id}, ${m1.id}, 1000)`;
        await tx`insert into expense_shares (expense_id, member_id, amount) values (${e.id}, ${m1.id}, 1000)`;
      });
    } finally {
      await sql.end({ timeout: 5 });
      const cleanup = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
      await cleanup.unsafe(`drop database if exists ${dbName} with (force)`);
      await cleanup.end();
    }
  });
});
