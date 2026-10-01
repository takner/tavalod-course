import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMembers, groups, invites, settlements, users } from "@/db/schema";
import { computeBalances } from "@/domain/ledger";
import { assertId, lockGroup, requireAdmin, requireMember, type Actor } from "./access";
import { notifyMembers, writeAudit } from "./audit";
import { randomToken, sha256 } from "./crypto";
import { forbidden, invalid, notFound } from "./errors";
import { displayName, email as emailSchema, id } from "./inputs";
import { loadGroupLedger } from "./ledger";

const GROUP_INVITE_DAYS = 7;
const CLAIM_INVITE_DAYS = 3;

export async function createGroup(actor: Actor, rawName: string): Promise<{ groupId: string }> {
  const name = displayName.parse(rawName);
  return getDb().transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, actor.userId)).limit(1);
    if (!user) throw notFound("کاربر");
    const [g] = await tx.insert(groups).values({ name, createdBy: actor.userId }).returning();
    await tx.insert(groupMembers).values({ groupId: g.id, userId: actor.userId, displayName: user.name, role: "owner" });
    await writeAudit(tx, { groupId: g.id, entityType: "group", entityId: g.id, action: "create", actor, after: g });
    return { groupId: g.id };
  });
}

/** Adds a guest: someone who can owe / be owed before (or without ever) creating an account. */
export async function addGuestMember(actor: Actor, groupId: string, rawName: string): Promise<{ memberId: string }> {
  const name = displayName.parse(rawName);
  return getDb().transaction(async (tx) => {
    await requireAdmin(tx, groupId, actor);
    const [m] = await tx.insert(groupMembers).values({ groupId, displayName: name, role: "member" }).returning();
    await writeAudit(tx, { groupId, entityType: "member", entityId: m.id, action: "add_guest", actor, after: m });
    return { memberId: m.id };
  });
}

export async function renameMember(actor: Actor, groupId: string, memberId: string, rawName: string): Promise<void> {
  assertId(memberId, "عضو");
  const name = displayName.parse(rawName);
  await getDb().transaction(async (tx) => {
    const me = await requireMember(tx, groupId, actor);
    const [m] = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId)))
      .limit(1);
    if (!m) throw notFound("عضو");
    if (m.id !== me.id && me.role === "member") throw forbidden();
    await tx.update(groupMembers).set({ displayName: name }).where(eq(groupMembers.id, memberId));
    await writeAudit(tx, { groupId, entityType: "member", entityId: m.id, action: "rename", actor, before: m, after: { ...m, displayName: name } });
  });
}

/**
 * Removes a member from the group. Only allowed when their balance is exactly zero and they have
 * no pending settlements, so nobody's money silently disappears.
 */
export async function removeMember(actor: Actor, groupId: string, memberId: string): Promise<void> {
  assertId(memberId, "عضو");
  await getDb().transaction(async (tx) => {
    const me = await requireMember(tx, groupId, actor);
    await lockGroup(tx, groupId);
    const [m] = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)))
      .limit(1);
    if (!m) throw notFound("عضو");
    const self = m.id === me.id;
    if (!self && me.role === "member") throw forbidden("فقط مدیر گروه می‌تواند عضو را حذف کند.");
    if (m.role === "owner") throw invalid("مالک گروه را نمی‌توان حذف کرد.");

    const ledger = await loadGroupLedger(tx, groupId);
    const balance = computeBalances(ledger.expenses, ledger.settlements).get(m.id) ?? 0n;
    if (balance !== 0n) throw invalid("مانده حساب این عضو صفر نیست؛ ابتدا تسویه کنید.");
    const [pending] = await tx
      .select({ id: settlements.id })
      .from(settlements)
      .where(
        and(
          eq(settlements.groupId, groupId),
          eq(settlements.status, "pending"),
          sql`(${settlements.fromMemberId} = ${m.id} or ${settlements.toMemberId} = ${m.id})`,
        ),
      )
      .limit(1);
    if (pending) throw invalid("این عضو تسویه در انتظار تأیید دارد.");

    await tx.update(groupMembers).set({ leftAt: new Date() }).where(eq(groupMembers.id, m.id));
    await writeAudit(tx, { groupId, entityType: "member", entityId: m.id, action: "remove", actor, before: m });
  });
}

export async function setMemberRole(actor: Actor, groupId: string, memberId: string, role: "admin" | "member") {
  assertId(memberId, "عضو");
  await getDb().transaction(async (tx) => {
    const me = await requireMember(tx, groupId, actor);
    if (me.role !== "owner") throw forbidden("فقط مالک گروه می‌تواند نقش‌ها را تغییر دهد.");
    const [m] = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)))
      .limit(1);
    if (!m || m.role === "owner") throw notFound("عضو");
    if (!m.userId) throw invalid("عضو مهمان نمی‌تواند مدیر باشد.");
    await tx.update(groupMembers).set({ role }).where(eq(groupMembers.id, memberId));
    await writeAudit(tx, { groupId, entityType: "member", entityId: m.id, action: "role", actor, before: m, after: { ...m, role } });
  });
}

// ───────────────────────── invites ─────────────────────────

/**
 * A general group invite link: anyone who opens it while signed in joins as a NEW member.
 * It can never be used to take over an existing guest.
 */
export async function createGroupInvite(actor: Actor, groupId: string): Promise<{ token: string; expiresAt: Date }> {
  return getDb().transaction(async (tx) => {
    await requireAdmin(tx, groupId, actor);
    const token = randomToken();
    const expiresAt = new Date(Date.now() + GROUP_INVITE_DAYS * 86_400_000);
    const [inv] = await tx
      .insert(invites)
      .values({ tokenHash: sha256(token), groupId, kind: "group", createdBy: actor.userId, expiresAt, maxUses: 50 })
      .returning();
    await writeAudit(tx, { groupId, entityType: "invite", entityId: inv.id, action: "create_group_invite", actor, after: { ...inv, tokenHash: undefined } });
    return { token, expiresAt };
  });
}

/**
 * A claim invite binds one specific guest to the account that uses it. Single use, short expiry,
 * optionally restricted to one email address. Creating a new one revokes older ones for that guest.
 */
export async function createClaimInvite(
  actor: Actor,
  groupId: string,
  memberId: string,
  rawEmail?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const restrictedEmail = rawEmail ? emailSchema.parse(rawEmail) : null;
  id.parse(memberId);
  return getDb().transaction(async (tx) => {
    await requireAdmin(tx, groupId, actor);
    const [m] = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)))
      .limit(1);
    if (!m) throw notFound("عضو");
    if (m.userId) throw invalid("این عضو قبلاً به یک حساب متصل شده است.");
    await tx
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.claimMemberId, memberId), isNull(invites.revokedAt)));
    const token = randomToken();
    const expiresAt = new Date(Date.now() + CLAIM_INVITE_DAYS * 86_400_000);
    const [inv] = await tx
      .insert(invites)
      .values({
        tokenHash: sha256(token),
        groupId,
        kind: "claim",
        claimMemberId: memberId,
        email: restrictedEmail,
        createdBy: actor.userId,
        expiresAt,
        maxUses: 1,
      })
      .returning();
    await writeAudit(tx, { groupId, entityType: "invite", entityId: inv.id, action: "create_claim_invite", actor, after: { ...inv, tokenHash: undefined } });
    return { token, expiresAt };
  });
}

export async function revokeInvite(actor: Actor, groupId: string, inviteId: string): Promise<void> {
  assertId(inviteId, "دعوت");
  await getDb().transaction(async (tx) => {
    await requireAdmin(tx, groupId, actor);
    await tx
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.id, inviteId), eq(invites.groupId, groupId)));
    await writeAudit(tx, { groupId, entityType: "invite", entityId: inviteId, action: "revoke", actor });
  });
}

export interface InvitePreview {
  groupId: string;
  groupName: string;
  kind: "group" | "claim";
  guestName: string | null;
  alreadyMember: boolean;
}

function inviteProblem(inv: typeof invites.$inferSelect | undefined): string | null {
  if (!inv) return "این لینک دعوت معتبر نیست.";
  if (inv.revokedAt) return "این لینک دعوت لغو شده است.";
  if (inv.expiresAt.getTime() < Date.now()) return "مهلت این لینک دعوت تمام شده است.";
  if (inv.uses >= inv.maxUses) return "این لینک دعوت قبلاً استفاده شده است.";
  return null;
}

export async function previewInvite(actor: Actor | null, token: string): Promise<InvitePreview> {
  const db = getDb();
  const [inv] = await db.select().from(invites).where(eq(invites.tokenHash, sha256(token))).limit(1);
  const problem = inviteProblem(inv);
  if (problem) throw invalid(problem);
  const [g] = await db.select().from(groups).where(eq(groups.id, inv!.groupId)).limit(1);
  let guestName: string | null = null;
  if (inv!.claimMemberId) {
    const [m] = await db.select().from(groupMembers).where(eq(groupMembers.id, inv!.claimMemberId)).limit(1);
    guestName = m?.displayName ?? null;
  }
  let alreadyMember = false;
  if (actor) {
    const [m] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, actor.userId), isNull(groupMembers.leftAt)))
      .limit(1);
    alreadyMember = Boolean(m);
  }
  return { groupId: g.id, groupName: g.name, kind: inv!.kind, guestName, alreadyMember };
}

/** Uses an invite. Group invite → new member. Claim invite → binds exactly that guest. */
export async function acceptInvite(actor: Actor, token: string): Promise<{ groupId: string; memberId: string }> {
  return getDb().transaction(async (tx) => {
    const [inv] = await tx.select().from(invites).where(eq(invites.tokenHash, sha256(token))).for("update").limit(1);
    const problem = inviteProblem(inv);
    if (problem) throw invalid(problem);
    const invite = inv!;
    const [user] = await tx.select().from(users).where(eq(users.id, actor.userId)).limit(1);
    if (!user) throw notFound("کاربر");
    if (invite.email && invite.email !== user.email) {
      throw forbidden("این دعوت برای ایمیل دیگری صادر شده است.");
    }
    const [existing] = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, invite.groupId), eq(groupMembers.userId, actor.userId)))
      .limit(1);
    if (existing && !existing.leftAt) {
      if (invite.kind === "claim") throw invalid("شما قبلاً عضو این گروه هستید و نمی‌توانید عضو مهمان دیگری را تصاحب کنید.");
      return { groupId: invite.groupId, memberId: existing.id };
    }

    let memberId: string;
    if (invite.kind === "claim") {
      const [guest] = await tx
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.id, invite.claimMemberId!))
        .for("update")
        .limit(1);
      if (!guest || guest.leftAt || guest.userId) throw invalid("این عضو مهمان دیگر قابل اتصال نیست.");
      if (existing) {
        // A former member re-joining through a claim: free the old row's user binding first.
        await tx.update(groupMembers).set({ userId: null }).where(eq(groupMembers.id, existing.id));
      }
      await tx.update(groupMembers).set({ userId: actor.userId }).where(eq(groupMembers.id, guest.id));
      memberId = guest.id;
    } else if (existing) {
      await tx.update(groupMembers).set({ leftAt: null, displayName: user.name }).where(eq(groupMembers.id, existing.id));
      memberId = existing.id;
    } else {
      const [m] = await tx
        .insert(groupMembers)
        .values({ groupId: invite.groupId, userId: actor.userId, displayName: user.name, role: "member" })
        .returning();
      memberId = m.id;
    }

    const [used] = await tx
      .update(invites)
      .set({ uses: sql`${invites.uses} + 1` })
      .where(and(eq(invites.id, invite.id), sql`${invites.uses} < ${invites.maxUses}`))
      .returning({ uses: invites.uses });
    if (!used) throw invalid("این لینک دعوت قبلاً استفاده شده است.");

    await writeAudit(tx, {
      groupId: invite.groupId,
      entityType: "member",
      entityId: memberId,
      action: invite.kind === "claim" ? "claim" : "join",
      actor,
    });
    const admins = await tx
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, invite.groupId), sql`${groupMembers.role} in ('owner','admin')`));
    await notifyMembers(tx, invite.groupId, admins.map((a) => a.id), actor, "member_joined", {
      memberId,
      name: user.name,
      claimed: invite.kind === "claim",
    });
    return { groupId: invite.groupId, memberId };
  });
}
