import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  eventParticipants,
  events,
  expenses,
  groupMembers,
  groups,
  invites,
  notifications,
  settlementAllocations,
  settlements,
  users,
} from "@/db/schema";
import {
  computeBalances,
  computeScopedBalances,
  explainBalance,
  isScopeSettled,
  type Balances,
  type ExplainLine,
} from "@/domain/ledger";
import { refundableRemaining } from "@/domain/refund";
import { suggestTransfers, type Transfer } from "@/domain/simplify";
import { assertId, isAdmin, requireMember, type Actor, type MemberRow } from "./access";
import { notFound } from "./errors";
import { getExpenseRecord } from "./expenses";
import { loadGroupLedger } from "./ledger";

export interface MemberInfo {
  id: string;
  name: string;
  role: MemberRow["role"];
  isGuest: boolean;
  isMe: boolean;
  active: boolean;
}

function toMemberInfo(rows: MemberRow[], me: MemberRow): MemberInfo[] {
  return rows
    .map((m) => ({
      id: m.id,
      name: m.displayName,
      role: m.role,
      isGuest: m.userId === null,
      isMe: m.id === me.id,
      active: m.leftAt === null,
    }))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name, "fa"));
}

async function membersOf(groupId: string) {
  return getDb().select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
}

export async function listMyGroups(actor: Actor) {
  const db = getDb();
  const mine = await db
    .select({ member: groupMembers, group: groups })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, actor.userId), isNull(groupMembers.leftAt)))
    .orderBy(desc(groups.createdAt));
  return Promise.all(
    mine.map(async ({ member, group }) => {
      const ledger = await loadGroupLedger(db, group.id);
      const balance = computeBalances(ledger.expenses, ledger.settlements).get(member.id) ?? 0n;
      return { id: group.id, name: group.name, myMemberId: member.id, myBalance: balance };
    }),
  );
}

export interface PendingSettlementView {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: bigint;
  method: string;
  note: string | null;
  createdAt: Date;
  canDecide: boolean;
  allocations: { eventId: string | null; amount: bigint }[];
}

export async function getGroupView(actor: Actor, groupId: string) {
  const db = getDb();
  const me = await requireMember(db, groupId, actor);
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const [memberRows, eventRows, ledger] = await Promise.all([
    membersOf(groupId),
    db.select().from(events).where(eq(events.groupId, groupId)).orderBy(desc(events.createdAt)),
    loadGroupLedger(db, groupId),
  ]);
  const members = toMemberInfo(memberRows, me);
  const memberById = new Map(memberRows.map((m) => [m.id, m]));
  const balances = computeBalances(ledger.expenses, ledger.settlements);
  const scoped = computeScopedBalances(ledger.expenses, ledger.settlements);
  const pendingRows = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.groupId, groupId), eq(settlements.status, "pending")))
    .orderBy(desc(settlements.createdAt));
  const ledgerSettlementById = new Map(ledger.settlements.map((s) => [s.id, s]));
  const pending: PendingSettlementView[] = pendingRows.map((s) => {
    const receiver = memberById.get(s.toMemberId)!;
    return {
      id: s.id,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amount: s.amount,
      method: s.method,
      note: s.note,
      createdAt: s.createdAt,
      canDecide: receiver.userId ? receiver.userId === actor.userId : isAdmin(me),
      allocations: ledgerSettlementById.get(s.id)?.allocations ?? [],
    };
  });

  const spentByEvent = new Map<string, bigint>();
  for (const e of ledger.expenses) {
    if (e.deleted || !e.eventId) continue;
    const sign = e.kind === "refund" ? -1n : 1n;
    spentByEvent.set(e.eventId, (spentByEvent.get(e.eventId) ?? 0n) + sign * e.totalAmount);
  }

  return {
    group,
    me: { id: me.id, role: me.role, isAdmin: isAdmin(me) },
    members,
    balances,
    suggestions: suggestTransfers(balances),
    pending,
    events: eventRows.map((ev) => ({
      ...ev,
      spent: spentByEvent.get(ev.id) ?? 0n,
      settled: isScopeSettled(scoped.get(ev.id)),
    })),
    generalExpenseCount: ledger.expenses.filter((e) => !e.eventId && !e.deleted).length,
  };
}

export async function getGroupMembersForForm(actor: Actor, groupId: string) {
  const db = getDb();
  const me = await requireMember(db, groupId, actor);
  const rows = await membersOf(groupId);
  const [group] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, groupId));
  const evs = await db
    .select({ id: events.id, title: events.title, status: events.status })
    .from(events)
    .where(eq(events.groupId, groupId))
    .orderBy(desc(events.createdAt));
  return {
    group,
    me: { id: me.id, isAdmin: isAdmin(me) },
    members: toMemberInfo(rows, me).filter((m) => m.active),
    events: evs,
  };
}

export async function getEventView(actor: Actor, groupId: string, eventId: string) {
  const db = getDb();
  assertId(eventId, "رویداد");
  const me = await requireMember(db, groupId, actor);
  const [ev] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.groupId, groupId)))
    .limit(1);
  if (!ev) throw notFound("رویداد");
  const [memberRows, participants, ledger, expenseRows] = await Promise.all([
    membersOf(groupId),
    db.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId)),
    loadGroupLedger(db, groupId),
    db.select().from(expenses).where(eq(expenses.eventId, eventId)).orderBy(desc(expenses.date), desc(expenses.createdAt)),
  ]);
  const scoped = computeScopedBalances(ledger.expenses, ledger.settlements);
  const balances: Balances = scoped.get(eventId) ?? new Map();
  const pendingAlloc = await db
    .select({ id: settlements.id })
    .from(settlementAllocations)
    .innerJoin(settlements, eq(settlements.id, settlementAllocations.settlementId))
    .where(and(eq(settlementAllocations.eventId, eventId), eq(settlements.status, "pending")))
    .limit(1);
  const spent = ledger.expenses
    .filter((e) => e.eventId === eventId && !e.deleted)
    .reduce((acc, e) => acc + (e.kind === "refund" ? -e.totalAmount : e.totalAmount), 0n);
  return {
    event: ev,
    me: { id: me.id, isAdmin: isAdmin(me), canManage: ev.createdBy === actor.userId || isAdmin(me) },
    members: toMemberInfo(memberRows, me),
    participantIds: participants.map((p) => p.memberId),
    expenses: expenseRows,
    balances,
    spent,
    closable: isScopeSettled(balances) && pendingAlloc.length === 0,
  };
}

export async function getExpenseView(actor: Actor, groupId: string, expenseId: string) {
  const db = getDb();
  const me = await requireMember(db, groupId, actor);
  const rec = await getExpenseRecord(actor, expenseId);
  if (rec.expense.groupId !== groupId) throw notFound("هزینه");
  const [memberRows, history, refunds, original, ev] = await Promise.all([
    membersOf(groupId),
    db
      .select({ log: auditLog, actorName: users.name })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.entityType, "expense"), eq(auditLog.entityId, expenseId)))
      .orderBy(desc(auditLog.at)),
    db
      .select()
      .from(expenses)
      .where(eq(expenses.refundOfExpenseId, expenseId))
      .orderBy(desc(expenses.createdAt)),
    rec.expense.refundOfExpenseId
      ? db.select().from(expenses).where(eq(expenses.id, rec.expense.refundOfExpenseId)).limit(1)
      : Promise.resolve([]),
    rec.expense.eventId
      ? db.select().from(events).where(eq(events.id, rec.expense.eventId)).limit(1)
      : Promise.resolve([]),
  ]);
  const activeRefunds = refunds.filter((r) => !r.deletedAt);
  return {
    ...rec,
    me: { id: me.id, isAdmin: isAdmin(me) },
    canEdit: !rec.expense.deletedAt && (rec.expense.createdBy === actor.userId || isAdmin(me)),
    members: toMemberInfo(memberRows, me),
    history: history.map((h) => ({ ...h.log, actorName: h.actorName })),
    refunds,
    original: original[0] ?? null,
    event: ev[0] ?? null,
    refundable:
      rec.expense.kind === "expense" && !rec.expense.deletedAt
        ? refundableRemaining(rec.expense.totalAmount, activeRefunds.map((r) => r.totalAmount))
        : 0n,
  };
}

export async function getBalanceExplanation(actor: Actor, groupId: string, memberId: string, eventId?: string) {
  assertId(memberId, "عضو");
  if (eventId !== undefined) assertId(eventId, "رویداد");
  const db = getDb();
  const me = await requireMember(db, groupId, actor);
  const rows = await membersOf(groupId);
  const member = rows.find((m) => m.id === memberId);
  if (!member) throw notFound("عضو");
  const ledger = await loadGroupLedger(db, groupId);
  const opts = eventId !== undefined ? { eventId } : {};
  const lines: ExplainLine[] = explainBalance(memberId, ledger.expenses, ledger.settlements, opts);
  const pendingLines = explainBalance(memberId, [], ledger.settlements, { ...opts, settlementStatuses: ["pending"] });
  const total = lines.reduce((a, l) => a + l.effect, 0n);
  const eventTitles = new Map(
    (await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.groupId, groupId))).map((e) => [
      e.id,
      e.title,
    ]),
  );
  return {
    member: toMemberInfo([member], me)[0],
    members: toMemberInfo(rows, me),
    lines,
    pendingLines,
    total,
    eventTitles,
  };
}

const ACTIVITY_LIMIT = 60;

export async function getActivity(actor: Actor, groupId: string) {
  const db = getDb();
  await requireMember(db, groupId, actor);
  return db
    .select({ log: auditLog, actorName: users.name })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(eq(auditLog.groupId, groupId))
    .orderBy(desc(auditLog.at))
    .limit(ACTIVITY_LIMIT);
}

export async function listInvites(actor: Actor, groupId: string) {
  const db = getDb();
  const me = await requireMember(db, groupId, actor);
  if (!isAdmin(me)) return [];
  return db
    .select({
      id: invites.id,
      kind: invites.kind,
      claimMemberId: invites.claimMemberId,
      email: invites.email,
      expiresAt: invites.expiresAt,
      uses: invites.uses,
      maxUses: invites.maxUses,
    })
    .from(invites)
    .where(
      and(
        eq(invites.groupId, groupId),
        isNull(invites.revokedAt),
        sql`${invites.expiresAt} > now()`,
        sql`${invites.uses} < ${invites.maxUses}`,
      ),
    )
    .orderBy(desc(invites.createdAt));
}

export async function listNotifications(actor: Actor) {
  return getDb()
    .select({ n: notifications, groupName: groups.name })
    .from(notifications)
    .leftJoin(groups, eq(groups.id, notifications.groupId))
    .where(eq(notifications.userId, actor.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
}

export async function unreadNotificationCount(actor: Actor): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
  return n;
}

export async function markNotificationsRead(actor: Actor): Promise<void> {
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
}

/** "My account": a ledger across all my groups — not a withdrawable wallet. */
export async function getMyAccount(actor: Actor) {
  const db = getDb();
  const groupsList = await listMyGroups(actor);
  const myMemberIds = groupsList.map((g) => g.myMemberId);
  const pending = myMemberIds.length
    ? await db
        .select({ s: settlements, groupName: groups.name })
        .from(settlements)
        .innerJoin(groups, eq(groups.id, settlements.groupId))
        .where(
          and(
            eq(settlements.status, "pending"),
            sql`(${inArray(settlements.fromMemberId, myMemberIds)} or ${inArray(settlements.toMemberId, myMemberIds)})`,
          ),
        )
        .orderBy(desc(settlements.createdAt))
    : [];
  const memberNames = new Map<string, string>();
  if (pending.length) {
    const ids = [...new Set(pending.flatMap((p) => [p.s.fromMemberId, p.s.toMemberId]))];
    for (const m of await db.select().from(groupMembers).where(inArray(groupMembers.id, ids))) {
      memberNames.set(m.id, m.displayName);
    }
  }
  let owedToMe = 0n;
  let iOwe = 0n;
  for (const g of groupsList) {
    if (g.myBalance > 0n) owedToMe += g.myBalance;
    else iOwe -= g.myBalance;
  }
  return {
    groups: groupsList,
    owedToMe,
    iOwe,
    pendingIncoming: pending.filter((p) => myMemberIds.includes(p.s.toMemberId)),
    pendingOutgoing: pending.filter((p) => myMemberIds.includes(p.s.fromMemberId)),
    memberNames,
  };
}

export type { Transfer };
