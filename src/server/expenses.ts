import { and, eq, isNull } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { events, expensePayers, expenseShares, expenses } from "@/db/schema";
import { assertRefundAmount, defaultRefundSplit, refundableRemaining } from "@/domain/refund";
import { computeShares, validatePayers, type MemberAmount } from "@/domain/split";
import { assertId, isAdmin, lockGroup, requireActiveMembers, requireMember, type Actor } from "./access";
import { notifyMembers, writeAudit } from "./audit";
import { AppError, forbidden, invalid, notFound } from "./errors";
import { claimIdempotencyKey } from "./idempotency";
import { expenseInput, refundInput, type ExpenseInput } from "./inputs";

type ExpenseRow = typeof expenses.$inferSelect;

export interface ExpenseRecord {
  expense: ExpenseRow;
  payers: MemberAmount[];
  shares: (MemberAmount & { inputValue: bigint })[];
}

async function loadExpense(tx: Tx, expenseId: string, forUpdate = false): Promise<ExpenseRecord | null> {
  const q = tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  const [expense] = forUpdate ? await q.for("update") : await q;
  if (!expense) return null;
  const [payers, shares] = await Promise.all([
    tx.select().from(expensePayers).where(eq(expensePayers.expenseId, expenseId)),
    tx.select().from(expenseShares).where(eq(expenseShares.expenseId, expenseId)),
  ]);
  return {
    expense,
    payers: payers.map((p) => ({ memberId: p.memberId, amount: p.amount })).sort((a, b) => (a.memberId < b.memberId ? -1 : 1)),
    shares: shares
      .map((s) => ({ memberId: s.memberId, amount: s.amount, inputValue: s.inputValue }))
      .sort((a, b) => (a.memberId < b.memberId ? -1 : 1)),
  };
}

function affectedMembers(...records: (ExpenseRecord | null)[]): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    if (!r) continue;
    for (const p of r.payers) out.add(p.memberId);
    for (const s of r.shares) out.add(s.memberId);
  }
  return out;
}

/** An event that is closed or cancelled no longer accepts new or changed expenses. */
async function assertEventWritable(tx: Tx, groupId: string, eventId: string | null): Promise<void> {
  if (!eventId) return;
  const [ev] = await tx
    .select({ id: events.id, status: events.status })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.groupId, groupId)))
    .limit(1);
  if (!ev) throw notFound("رویداد");
  if (ev.status === "closed") throw invalid("این رویداد بسته شده است. برای تغییر، ابتدا آن را دوباره باز کنید.");
  if (ev.status === "cancelled") throw invalid("این رویداد لغو شده است. برای بازپرداخت از «برگشت خرید» استفاده کنید.");
}

function computeLines(input: ExpenseInput) {
  const payers = validatePayers(input.totalAmount, input.payers);
  const shares = computeShares(
    input.totalAmount,
    input.splitType,
    input.shares.map((s) => ({ memberId: s.memberId, value: s.value })),
  );
  const inputByMember = new Map(input.shares.map((s) => [s.memberId, input.splitType === "equal" ? 0n : s.value]));
  return {
    payers,
    shares: shares.map((s) => ({ ...s, inputValue: inputByMember.get(s.memberId) ?? 0n })),
  };
}

async function insertLines(tx: Tx, expenseId: string, lines: ReturnType<typeof computeLines>) {
  await tx.insert(expensePayers).values(lines.payers.map((p) => ({ expenseId, ...p })));
  await tx.insert(expenseShares).values(lines.shares.map((s) => ({ expenseId, ...s })));
}

export async function createExpense(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
): Promise<{ expenseId: string; replayed: boolean }> {
  const input = expenseInput.parse(raw);
  return getDb().transaction(async (tx) => {
    await requireMember(tx, input.groupId, actor);
    await lockGroup(tx, input.groupId);
    const idem = await claimIdempotencyKey(tx, actor, input.groupId, "expense.create", idempotencyKey, raw);
    if (idem.replayed) return { expenseId: idem.resultId, replayed: true };

    await assertEventWritable(tx, input.groupId, input.eventId);
    const lines = computeLines(input);
    await requireActiveMembers(tx, input.groupId, [...lines.payers, ...lines.shares].map((x) => x.memberId));

    const [row] = await tx
      .insert(expenses)
      .values({
        groupId: input.groupId,
        eventId: input.eventId,
        title: input.title,
        category: input.category,
        totalAmount: input.totalAmount,
        date: input.date,
        splitType: input.splitType,
        note: input.note || null,
        createdBy: actor.userId,
      })
      .returning();
    await insertLines(tx, row.id, lines);
    const after = await loadExpense(tx, row.id);
    await writeAudit(tx, { groupId: input.groupId, entityType: "expense", entityId: row.id, action: "create", actor, after });
    await notifyMembers(tx, input.groupId, affectedMembers(after), actor, "expense_created", {
      expenseId: row.id,
      title: row.title,
      amount: row.totalAmount,
    });
    await idem.complete(row.id);
    return { expenseId: row.id, replayed: false };
  });
}

async function requireEditable(tx: Tx, actor: Actor, expenseId: string, expectedVersion: number) {
  const before = await loadExpense(tx, expenseId, true);
  if (!before || before.expense.deletedAt) throw notFound("هزینه");
  const member = await requireMember(tx, before.expense.groupId, actor);
  if (before.expense.createdBy !== actor.userId && !isAdmin(member)) {
    throw forbidden("فقط ثبت‌کننده هزینه یا مدیر گروه می‌تواند آن را تغییر دهد.");
  }
  if (before.expense.version !== expectedVersion) {
    throw new AppError("VERSION_CONFLICT", "این هزینه در این فاصله توسط شخص دیگری تغییر کرده است. صفحه را تازه کنید.");
  }
  return before;
}

async function activeRefunds(tx: Tx, expenseId: string) {
  return tx
    .select({ id: expenses.id, totalAmount: expenses.totalAmount })
    .from(expenses)
    .where(and(eq(expenses.refundOfExpenseId, expenseId), isNull(expenses.deletedAt)));
}

export async function updateExpense(
  actor: Actor,
  expenseId: string,
  expectedVersion: number,
  raw: unknown,
): Promise<{ version: number }> {
  assertId(expenseId, "هزینه");
  const input = expenseInput.parse(raw);
  return getDb().transaction(async (tx) => {
    const [peek] = await tx.select({ groupId: expenses.groupId }).from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    if (!peek) throw notFound("هزینه");
    await requireMember(tx, peek.groupId, actor);
    await lockGroup(tx, peek.groupId);
    const before = await requireEditable(tx, actor, expenseId, expectedVersion);
    const e = before.expense;
    if (input.groupId !== e.groupId) throw invalid("گروه هزینه قابل تغییر نیست.");
    if (e.kind === "refund") throw invalid("برگشت خرید قابل ویرایش نیست؛ آن را حذف و دوباره ثبت کنید.");

    await assertEventWritable(tx, e.groupId, e.eventId);
    if (input.eventId !== e.eventId) await assertEventWritable(tx, e.groupId, input.eventId);

    const refunds = await activeRefunds(tx, expenseId);
    const refunded = refunds.reduce((a, r) => a + r.totalAmount, 0n);
    if (input.totalAmount < refunded) {
      throw invalid("مبلغ هزینه نمی‌تواند کمتر از مجموع برگشت‌های ثبت‌شده آن باشد.");
    }
    if (refunds.length > 0 && input.eventId !== e.eventId) {
      throw invalid("هزینه‌ای که برگشت خرید دارد را نمی‌توان به رویداد دیگری منتقل کرد.");
    }

    const lines = computeLines(input);
    await requireActiveMembers(tx, e.groupId, [...lines.payers, ...lines.shares].map((x) => x.memberId));

    await tx.delete(expensePayers).where(eq(expensePayers.expenseId, expenseId));
    await tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId));
    const [updated] = await tx
      .update(expenses)
      .set({
        eventId: input.eventId,
        title: input.title,
        category: input.category,
        totalAmount: input.totalAmount,
        date: input.date,
        splitType: input.splitType,
        note: input.note || null,
        version: e.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.version, expectedVersion)))
      .returning({ version: expenses.version });
    if (!updated) throw new AppError("VERSION_CONFLICT", "این هزینه در این فاصله تغییر کرده است.");
    await insertLines(tx, expenseId, lines);

    const after = await loadExpense(tx, expenseId);
    await writeAudit(tx, { groupId: e.groupId, entityType: "expense", entityId: expenseId, action: "update", actor, before, after });
    await notifyMembers(tx, e.groupId, affectedMembers(before, after), actor, "expense_updated", {
      expenseId,
      title: input.title,
      amount: input.totalAmount,
      previousAmount: e.totalAmount,
    });
    return { version: updated.version };
  });
}

/** Soft delete. History is kept; balances simply stop counting the expense. */
export async function deleteExpense(actor: Actor, expenseId: string, expectedVersion: number): Promise<void> {
  assertId(expenseId, "هزینه");
  await getDb().transaction(async (tx) => {
    const [peek] = await tx.select({ groupId: expenses.groupId }).from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    if (!peek) throw notFound("هزینه");
    await requireMember(tx, peek.groupId, actor);
    await lockGroup(tx, peek.groupId);
    const before = await requireEditable(tx, actor, expenseId, expectedVersion);
    await assertEventWritable(tx, before.expense.groupId, before.expense.eventId);
    if (before.expense.kind === "expense" && (await activeRefunds(tx, expenseId)).length > 0) {
      throw invalid("این هزینه برگشت خرید ثبت‌شده دارد؛ ابتدا برگشت‌ها را حذف کنید.");
    }
    await tx
      .update(expenses)
      .set({ deletedAt: new Date(), version: before.expense.version + 1, updatedAt: new Date() })
      .where(eq(expenses.id, expenseId));
    await writeAudit(tx, {
      groupId: before.expense.groupId,
      entityType: "expense",
      entityId: expenseId,
      action: "delete",
      actor,
      before,
    });
    await notifyMembers(tx, before.expense.groupId, affectedMembers(before), actor, "expense_deleted", {
      expenseId,
      title: before.expense.title,
      amount: before.expense.totalAmount,
    });
  });
}

/**
 * Records a (partial or full) refund against an expense. The refund is linked to the original,
 * capped by what remains refundable (checked under a row lock), and idempotent.
 */
export async function createRefund(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
): Promise<{ expenseId: string; replayed: boolean }> {
  const input = refundInput.parse(raw);
  return getDb().transaction(async (tx) => {
    const [peek] = await tx
      .select({ groupId: expenses.groupId })
      .from(expenses)
      .where(eq(expenses.id, input.expenseId))
      .limit(1);
    if (!peek) throw notFound("هزینه");
    await requireMember(tx, peek.groupId, actor);
    await lockGroup(tx, peek.groupId);
    const idem = await claimIdempotencyKey(tx, actor, peek.groupId, "refund.create", idempotencyKey, raw);
    if (idem.replayed) return { expenseId: idem.resultId, replayed: true };

    const original = await loadExpense(tx, input.expenseId, true);
    if (!original || original.expense.deletedAt) throw notFound("هزینه");
    const o = original.expense;
    if (o.kind !== "expense") throw invalid("برای برگشت خرید نمی‌توان دوباره برگشت ثبت کرد.");
    if (o.eventId) {
      const [ev] = await tx.select({ status: events.status }).from(events).where(eq(events.id, o.eventId)).limit(1);
      if (ev?.status === "closed") throw invalid("این رویداد بسته شده است. ابتدا آن را دوباره باز کنید.");
    }

    const remaining = refundableRemaining(
      o.totalAmount,
      (await activeRefunds(tx, o.id)).map((r) => r.totalAmount),
    );
    assertRefundAmount(input.amount, remaining);

    const split = defaultRefundSplit(input.amount, original);
    const receivers = input.receivers ? validatePayers(input.amount, input.receivers) : split.receivers;
    await requireActiveMembers(tx, o.groupId, [...receivers, ...split.shares].map((x) => x.memberId));

    const [row] = await tx
      .insert(expenses)
      .values({
        groupId: o.groupId,
        eventId: o.eventId,
        title: `برگشت: ${o.title}`,
        category: o.category,
        totalAmount: input.amount,
        date: input.date,
        splitType: "exact",
        kind: "refund",
        refundOfExpenseId: o.id,
        note: input.note || null,
        createdBy: actor.userId,
      })
      .returning();
    await tx.insert(expensePayers).values(receivers.map((p) => ({ expenseId: row.id, ...p })));
    await tx
      .insert(expenseShares)
      .values(split.shares.map((s) => ({ expenseId: row.id, memberId: s.memberId, amount: s.amount, inputValue: s.amount })));

    const after = await loadExpense(tx, row.id);
    await writeAudit(tx, { groupId: o.groupId, entityType: "expense", entityId: row.id, action: "refund", actor, after });
    await notifyMembers(tx, o.groupId, affectedMembers(after), actor, "refund_created", {
      expenseId: row.id,
      originalExpenseId: o.id,
      title: o.title,
      amount: input.amount,
    });
    await idem.complete(row.id);
    return { expenseId: row.id, replayed: false };
  });
}

export async function getExpenseRecord(actor: Actor, expenseId: string): Promise<ExpenseRecord> {
  assertId(expenseId, "هزینه");
  return getDb().transaction(async (tx) => {
    const rec = await loadExpense(tx, expenseId);
    if (!rec) throw notFound("هزینه");
    await requireMember(tx, rec.expense.groupId, actor);
    return rec;
  });
}
