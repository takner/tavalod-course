import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { expenses, loginTokens, users } from "@/db/schema";
import { sha256 } from "@/server/crypto";
import {
  consumeLoginToken,
  deleteSession,
  getUserForSession,
  requestLoginLink,
} from "@/server/auth";
import { toAppError } from "@/server/errors";
import { createExpense } from "@/server/expenses";
import {
  acceptInvite,
  createClaimInvite,
  createGroupInvite,
  previewInvite,
  removeMember,
} from "@/server/groups";
import { getGroupView } from "@/server/queries";
import { processSyncOps } from "@/server/sync";
import { equalExpense, key, makeGroup, makeUser, memberIdOf } from "./helpers";

afterAll(async () => {
  await closeDb();
});

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => toAppError(e).code === code);
}

describe("scenario 6 — offline sync replays", () => {
  it("a repeated op creates one record; same key with other data conflicts; removed members are rejected", async () => {
    const ali = await makeUser("Ali");
    const sara = await makeUser("Sara");
    const { groupId, ids } = await makeGroup(ali, ["reza"]);
    const { token } = await createGroupInvite(ali, groupId);
    await acceptInvite(sara, token);
    const saraId = await memberIdOf(groupId, sara);

    const clientKey = key();
    const payload = equalExpense(groupId, 120_000n, saraId, [saraId, ids.owner]);
    const first = await processSyncOps(sara, [{ type: "expense.create", clientKey, payload }]);
    // The response was "lost" — the client sends the same op again, twice.
    const again = await processSyncOps(sara, [
      { type: "expense.create", clientKey, payload },
      { type: "expense.create", clientKey, payload },
    ]);
    expect(first[0].ok).toBe(true);
    expect(again.every((r) => r.ok && r.replayed)).toBe(true);
    const rows = await getDb().select().from(expenses).where(eq(expenses.groupId, groupId));
    expect(rows).toHaveLength(1);

    const changed = await processSyncOps(sara, [
      { type: "expense.create", clientKey, payload: { ...payload, title: "تغییر کرده" } },
    ]);
    expect(changed[0]).toMatchObject({ ok: false, retryable: false, error: { code: "IDEMPOTENCY_CONFLICT" } });

    // The same client key from another user is a different operation, not a replay.
    const aliOp = await processSyncOps(ali, [
      { type: "expense.create", clientKey, payload: equalExpense(groupId, 5_000n, ids.owner, [ids.owner, ids.reza]) },
    ]);
    expect(aliOp[0]).toMatchObject({ ok: true, replayed: false });

    // Balances settle so Sara can be removed; an op queued while she was offline is then rejected.
    const view = await getGroupView(ali, groupId);
    expect(view.balances.get(saraId)).toBe(60_000n);
    await processSyncOps(ali, [
      {
        type: "settlement.create",
        clientKey: key(),
        payload: { groupId, fromMemberId: ids.owner, toMemberId: saraId, amount: "60000", method: "cash" },
      },
    ]);
    const settled = await getGroupView(ali, groupId);
    // Ali recorded a payment to Sara (who has an account) → pending until Sara confirms.
    expect(settled.pending).toHaveLength(1);
    await expectAppError(removeMember(ali, groupId, saraId), "VALIDATION");
  });

  it("an op from a user who is no longer a member fails without retry", async () => {
    const ali = await makeUser("Ali");
    const sara = await makeUser("Sara");
    const { groupId, ids } = await makeGroup(ali, []);
    const { token } = await createGroupInvite(ali, groupId);
    await acceptInvite(sara, token);
    const saraId = await memberIdOf(groupId, sara);
    await removeMember(ali, groupId, saraId);
    const r = await processSyncOps(sara, [
      { type: "expense.create", clientKey: key(), payload: equalExpense(groupId, 1000n, ids.owner, [ids.owner]) },
    ]);
    expect(r[0]).toMatchObject({ ok: false, retryable: false, error: { code: "NOT_FOUND" } });
  });
});

describe("scenario 7 — guest members and claims", () => {
  it("a claim invite binds exactly one guest, once; a group link can never take over a guest", async () => {
    const ali = await makeUser("Ali");
    const mina = await makeUser("Mina");
    const intruder = await makeUser("Intruder");
    const { groupId, ids } = await makeGroup(ali, ["مینا"]);
    await createExpense(ali, equalExpense(groupId, 300_000n, ids.owner, [ids.owner, ids["مینا"]]), key());

    // General link → a brand-new member, the guest stays unclaimed.
    const { token: groupToken } = await createGroupInvite(ali, groupId);
    const joined = await acceptInvite(intruder, groupToken);
    expect(joined.memberId).not.toBe(ids["مینا"]);

    const { token } = await createClaimInvite(ali, groupId, ids["مینا"], mina.email);
    const preview = await previewInvite(mina, token);
    expect(preview).toMatchObject({ kind: "claim", guestName: "مینا" });

    // Restricted to Mina's email.
    await expectAppError(acceptInvite(intruder, token), "FORBIDDEN");
    const claimed = await acceptInvite(mina, token);
    expect(claimed.memberId).toBe(ids["مینا"]);
    expect(await memberIdOf(groupId, mina)).toBe(ids["مینا"]);
    const view = await getGroupView(mina, groupId);
    expect(view.balances.get(ids["مینا"])).toBe(-150_000n);

    // Single use.
    await expectAppError(acceptInvite(mina, token), "VALIDATION");
    // Claiming an already-bound member is impossible.
    await expectAppError(createClaimInvite(ali, groupId, ids["مینا"]), "VALIDATION");
  });

  it("a newer claim invite revokes the previous one", async () => {
    const ali = await makeUser("Ali");
    const mina = await makeUser("Mina");
    const { groupId, ids } = await makeGroup(ali, ["مینا"]);
    const { token: old } = await createClaimInvite(ali, groupId, ids["مینا"]);
    const { token: fresh } = await createClaimInvite(ali, groupId, ids["مینا"]);
    await expectAppError(acceptInvite(mina, old), "VALIDATION");
    await acceptInvite(mina, fresh);
  });
});

describe("scenario 9 — permissions", () => {
  it("non-members see nothing; regular members cannot manage invites", async () => {
    const ali = await makeUser("Ali");
    const sara = await makeUser("Sara");
    const outsider = await makeUser("Out");
    const { groupId, ids } = await makeGroup(ali, []);
    const { token } = await createGroupInvite(ali, groupId);
    await acceptInvite(sara, token);

    await expectAppError(getGroupView(outsider, groupId), "NOT_FOUND");
    await expectAppError(
      createExpense(outsider, equalExpense(groupId, 1000n, ids.owner, [ids.owner]), key()),
      "NOT_FOUND",
    );
    await expectAppError(createGroupInvite(sara, groupId), "FORBIDDEN");
    await expectAppError(createClaimInvite(sara, groupId, ids.owner), "FORBIDDEN");
  });
});

describe("email sign-in", () => {
  it("tokens are single-use, expire, are stored hashed, and requests are rate-limited", async () => {
    const email = `login-${Date.now()}@test.local`;
    await requestLoginLink(email.toUpperCase(), "/groups");
    const [row] = await getDb().select().from(loginTokens).where(eq(loginTokens.email, email));
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // We cannot read the token back (only its hash is stored), so issue one with a known value.
    const token = "known-token-value-for-test-0123456789";
    await getDb()
      .insert(loginTokens)
      .values({ email, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60_000), nextPath: "/groups" });
    const session = await consumeLoginToken(token);
    expect(session.isNewUser).toBe(true);
    expect(session.nextPath).toBe("/groups");
    await expectAppError(consumeLoginToken(token), "VALIDATION");

    const user = await getUserForSession(session.sessionToken);
    expect(user?.email).toBe(email);
    await deleteSession(session.sessionToken);
    expect(await getUserForSession(session.sessionToken)).toBeNull();

    const expired = "expired-token-value-for-test-0123456789";
    await getDb()
      .insert(loginTokens)
      .values({ email, tokenHash: sha256(expired), expiresAt: new Date(Date.now() - 1000) });
    await expectAppError(consumeLoginToken(expired), "VALIDATION");

    for (let i = 0; i < 2; i++) await requestLoginLink(email);
    await expectAppError(requestLoginLink(email), "RATE_LIMITED");
    const [u] = await getDb().select().from(users).where(eq(users.email, email));
    expect(u).toBeDefined();
  });

  it("only same-site relative paths survive as post-login redirects", async () => {
    const { safeNextPath } = await import("@/server/auth");
    expect(safeNextPath("/groups/1")).toBe("/groups/1");
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
  });
});

describe("operator-issued sign-in links", () => {
  it("creates the account, allows the configured number of uses, then refuses", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(process.execPath, ["scripts/issue-login.mjs", "--days", "2", "--uses", "2", "دوست آزمایشی"], {
      env: { ...process.env, APP_URL: "https://tavalod.example" },
      encoding: "utf8",
    });
    const [name, email, link] = out.trim().split("\t");
    expect(name).toBe("دوست آزمایشی");
    expect(email).toMatch(/@login\.tavalod\.invalid$/);
    expect(link).toMatch(/^https:\/\/tavalod\.example\/auth\/verify\?token=/);
    const token = new URL(link).searchParams.get("token")!;

    const first = await consumeLoginToken(token);
    const second = await consumeLoginToken(token);
    expect(first.userId).toBe(second.userId);
    expect(first.isNewUser).toBe(false);
    expect(first.nextPath).toBe("/me?welcome=1");
    await expectAppError(consumeLoginToken(token), "VALIDATION");
    const [u] = await getDb().select().from(users).where(eq(users.email, email));
    expect(u.name).toBe("دوست آزمایشی");

    // Re-issuing for the same account keeps the existing user.
    const again = execFileSync(process.execPath, ["scripts/issue-login.mjs", `اسم دیگر:${email}`], { encoding: "utf8" });
    const reissued = await consumeLoginToken(new URL(again.trim().split("\t")[2]).searchParams.get("token")!);
    expect(reissued.userId).toBe(first.userId);
  });
});
