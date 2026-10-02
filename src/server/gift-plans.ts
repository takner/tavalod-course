import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Tx } from "@/db";
import {
  files,
  giftPledges,
  giftReallocations,
  gifts,
  groupMembers,
  settlements,
  wishlistItems,
  wishlistReservations,
} from "@/db/schema";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/domain/calendar";
import { DomainError } from "@/domain/errors";
import {
  assertGiftTransition,
  finalGiftShares,
  giftLedgerView,
  OverCapError,
  suggestEqualShares,
  type GiftStatus,
} from "@/domain/gifts";
import { formatToman, MAX_AMOUNT } from "@/domain/money";
import { assertId, isAdmin, lockGroup, requireMember, requireSpaceMember, requireSpaceMembers, type Actor } from "./access";
import { notifyMembers, writeAudit } from "./audit";
import { forbidden, invalid, notFound } from "./errors";
import { insertExpenseInTx } from "./expenses";
import { amountString, id, isoDate } from "./inputs";
import { loadGroupLedger } from "./ledger";
import { validatePublicHttpUrl } from "./net/safe-url";
import { reserveItemInTx } from "./wishlists";

const optionalMoney = z
  .string()
  .regex(/^\d{0,16}$/, "مبلغ معتبر نیست.")
  .optional()
  .transform((v) => (v ? BigInt(v) : null))
  .refine((v) => v === null || v <= MAX_AMOUNT, "مبلغ بیش از حد مجاز است.");

export const giftInput = z.object({
  spaceId: id,
  title: z.string().trim().min(1, "عنوان هدیه را وارد کنید.").max(120),
  description: z.string().trim().max(1000).optional(),
  productUrl: z.string().trim().max(2000).optional(),
  wishlistItemId: id.nullable().optional(),
  budget: optionalMoney,
  deadlineDate: isoDate.nullable().optional(),
  buyerMemberId: id,
  contributorIds: z.array(id).min(1, "حداقل یک مشارکت‌کننده انتخاب کنید.").max(100),
});

async function loadGift(tx: Tx, giftId: string, forUpdate = false) {
  assertId(giftId, "هدیه");
  const q = tx.select().from(gifts).where(eq(gifts.id, giftId)).limit(1);
  const [gift] = forUpdate ? await q.for("update") : await q;
  if (!gift) throw notFound("هدیه");
  return gift;
}

/** Access to a gift = access to its private space (the celebrant and outsiders get NOT_FOUND). */
async function requireGiftAccess(tx: Tx, actor: Actor, giftId: string, forUpdate = false) {
  const peek = await loadGift(tx, giftId);
  const access = await requireSpaceMember(tx, peek.spaceId, actor);
  const groupMember = await requireMember(tx, peek.groupId, actor);
  const gift = forUpdate ? await loadGift(tx, giftId, true) : peek;
  return { gift, member: access.member, isAdmin: isAdmin(groupMember) };
}

function canManage(gift: typeof gifts.$inferSelect, actor: Actor, memberId: string, admin: boolean) {
  return gift.createdBy === actor.userId || gift.buyerMemberId === memberId || admin;
}

export async function createGift(actor: Actor, raw: z.input<typeof giftInput>): Promise<{ giftId: string }> {
  const input = giftInput.parse(raw);
  const productUrl = input.productUrl ? validatePublicHttpUrl(input.productUrl, "لینک کالا") : null;
  return getDb().transaction(async (tx) => {
    const { space } = await requireSpaceMember(tx, input.spaceId, actor);
    await requireSpaceMembers(tx, input.spaceId, [input.buyerMemberId, ...input.contributorIds]);
    const [gift] = await tx
      .insert(gifts)
      .values({
        spaceId: space.id,
        groupId: space.groupId,
        title: input.title,
        description: input.description || null,
        productUrl,
        wishlistItemId: input.wishlistItemId ?? null,
        budget: input.budget,
        contributionDeadline: input.deadlineDate ? zonedTimeToUtc(input.deadlineDate, "23:59", DEFAULT_TIMEZONE) : null,
        buyerMemberId: input.buyerMemberId,
        createdBy: actor.userId,
      })
      .returning();
    await tx
      .insert(giftPledges)
      .values([...new Set(input.contributorIds)].map((memberId) => ({ giftId: gift.id, memberId, status: "invited" as const })));
    if (input.wishlistItemId) {
      // Hold the wishlist item for this group gift so nobody else buys it too (hidden from its owner).
      await reserveItemInTx(tx, actor, { groupId: space.groupId, itemId: input.wishlistItemId, deadline: null, note: `هدیه گروهی: ${gift.title}`, giftId: gift.id });
    }
    await writeAudit(tx, { groupId: space.groupId, entityType: "gift", entityId: gift.id, action: "create", actor, after: gift, spaceId: space.id });
    await notifyMembers(tx, space.groupId, input.contributorIds, actor, "gift_created", { giftId: gift.id, spaceId: space.id, title: gift.title }, { spaceId: space.id });
    return { giftId: gift.id };
  });
}

export const pledgeInput = z.object({
  decision: z.enum(["pledge", "decline"]),
  amount: z.string().optional(),
});

/**
 * A contributor accepts (with an amount = their cap) or declines. Pledges are informational: they
 * never move money or create debt. After purchase they are frozen; the history stays in the log.
 */
export async function respondPledge(actor: Actor, giftId: string, raw: z.input<typeof pledgeInput>): Promise<void> {
  const input = pledgeInput.parse(raw);
  await getDb().transaction(async (tx) => {
    const { gift, member } = await requireGiftAccess(tx, actor, giftId, true);
    if (gift.status === "purchased" || gift.status === "delivered" || gift.status === "cancelled") {
      throw invalid("بعد از خرید یا لغو، تعهدها قفل می‌شوند. برای تغییر سهم، از مسیر برگشت خرید یا تقسیم دستی اقدام کنید.");
    }
    const amount = input.decision === "pledge" ? amountString.parse(input.amount ?? "") : null;
    const [before] = await tx.select().from(giftPledges).where(and(eq(giftPledges.giftId, giftId), eq(giftPledges.memberId, member.id)));
    const values = { giftId, memberId: member.id, status: input.decision === "pledge" ? ("pledged" as const) : ("declined" as const), amount, updatedAt: new Date() };
    await tx.insert(giftPledges).values(values).onConflictDoUpdate({ target: [giftPledges.giftId, giftPledges.memberId], set: values });
    await writeAudit(tx, { groupId: gift.groupId, entityType: "gift", entityId: giftId, action: "pledge", actor, before: before ?? null, after: values, spaceId: gift.spaceId });
  });
}

export async function inviteContributors(actor: Actor, giftId: string, memberIds: string[]): Promise<void> {
  memberIds.forEach((m) => assertId(m, "عضو"));
  await getDb().transaction(async (tx) => {
    const { gift, member, isAdmin: admin } = await requireGiftAccess(tx, actor, giftId, true);
    if (!canManage(gift, actor, member.id, admin)) throw forbidden();
    if (gift.status === "purchased" || gift.status === "delivered" || gift.status === "cancelled") throw invalid("این هدیه دیگر مشارکت‌کننده جدید نمی‌پذیرد.");
    await requireSpaceMembers(tx, gift.spaceId, memberIds);
    if (!memberIds.length) return;
    await tx.insert(giftPledges).values(memberIds.map((memberId) => ({ giftId, memberId, status: "invited" as const }))).onConflictDoNothing();
    await notifyMembers(tx, gift.groupId, memberIds, actor, "gift_created", { giftId, spaceId: gift.spaceId, title: gift.title }, { spaceId: gift.spaceId });
  });
}

export async function setGiftStatus(actor: Actor, giftId: string, status: GiftStatus): Promise<void> {
  if (status === "purchased" || status === "cancelled") throw invalid("برای این تغییر از دکمه مخصوص آن استفاده کنید.");
  await getDb().transaction(async (tx) => {
    const { gift, member, isAdmin: admin } = await requireGiftAccess(tx, actor, giftId, true);
    if (!canManage(gift, actor, member.id, admin)) throw forbidden("فقط سازنده، مسئول خرید یا مدیر گروه می‌تواند وضعیت را تغییر دهد.");
    assertGiftTransition(gift.status, status);
    await tx.update(gifts).set({ status, updatedAt: new Date() }).where(eq(gifts.id, giftId));
    await writeAudit(tx, { groupId: gift.groupId, entityType: "gift", entityId: giftId, action: "status", actor, before: { status: gift.status }, after: { status }, spaceId: gift.spaceId });
    const pledgers = await tx.select({ memberId: giftPledges.memberId }).from(giftPledges).where(eq(giftPledges.giftId, giftId));
    await notifyMembers(tx, gift.groupId, pledgers.map((p) => p.memberId), actor, "gift_status", { giftId, spaceId: gift.spaceId, title: gift.title, status }, { spaceId: gift.spaceId });
  });
}

export const purchaseInput = z.object({
  total: amountString,
  date: isoDate,
  note: z.string().trim().max(500).optional(),
  receiptFileId: id.nullable().optional(),
  /** Optional custom split (each ≤ that person's pledge). Default: equal among pledgers. */
  customShares: z.array(z.object({ memberId: id, amount: z.string().regex(/^\d+$/).transform((v) => BigInt(v)) })).optional(),
});

/**
 * Records the real purchase as ONE private expense paid by the buyer, split by the agreed final
 * shares. Money handed over beforehand (confirmed collections) is already in the ledger as
 * settlements, so it automatically reduces what each person still owes — nothing is counted twice.
 * A share above someone's pledge is refused (they must raise it, or someone else takes the extra).
 */
export async function recordPurchase(actor: Actor, giftId: string, raw: z.input<typeof purchaseInput>): Promise<{ expenseId: string }> {
  const input = purchaseInput.parse(raw);
  return getDb().transaction(async (tx) => {
    const { gift, member } = await requireGiftAccess(tx, actor, giftId);
    await lockGroup(tx, gift.groupId);
    const locked = await loadGift(tx, giftId, true);
    if (member.id !== locked.buyerMemberId) throw forbidden("خرید را مسئول خرید همین هدیه ثبت می‌کند.");
    if (!["proposed", "collecting", "ready_to_buy"].includes(locked.status)) throw invalid("خرید این هدیه قبلاً ثبت شده یا هدیه لغو شده است.");
    if (input.receiptFileId) {
      const [f] = await tx.select({ owner: files.ownerUserId, purpose: files.purpose }).from(files).where(eq(files.id, input.receiptFileId));
      if (!f || f.owner !== actor.userId || f.purpose !== "receipt") throw invalid("فایل رسید معتبر نیست.");
    }
    const pledges = await tx
      .select()
      .from(giftPledges)
      .where(and(eq(giftPledges.giftId, giftId), eq(giftPledges.status, "pledged")));
    let shares;
    try {
      shares = finalGiftShares(
        input.total,
        pledges.map((p) => ({ memberId: p.memberId, amount: p.amount! })),
        input.customShares,
      );
    } catch (err) {
      if (err instanceof OverCapError) {
        const names = await tx
          .select({ id: groupMembers.id, name: groupMembers.displayName })
          .from(groupMembers)
          .where(inArray(groupMembers.id, err.overCap.map((o) => o.memberId)));
        const byId = new Map(names.map((n) => [n.id, n.name]));
        const detail = err.overCap.map((o) => `${byId.get(o.memberId)}: سهم ${formatToman(o.share)} > سقف ${formatToman(o.cap)}`).join("، ");
        throw invalid(`سهم بعضی افراد از سقف تعهدشان بیشتر می‌شود (${detail}). آن‌ها باید تعهد خود را بالا ببرند یا کسی مبلغ اضافه را بپذیرد (تقسیم دستی).`);
      }
      throw err;
    }
    const rec = await insertExpenseInTx(
      tx,
      actor,
      {
        groupId: locked.groupId,
        eventId: null,
        spaceId: locked.spaceId,
        title: `خرید هدیه: ${locked.title}`,
        category: "gift",
        date: input.date,
        totalAmount: input.total,
        splitType: "exact",
        payers: [{ memberId: locked.buyerMemberId, amount: input.total }],
        shares: shares.map((s) => ({ memberId: s.memberId, value: s.amount })),
        note: input.note,
      },
      { giftId },
    );
    await tx
      .update(gifts)
      .set({ status: "purchased", purchaseExpenseId: rec.expense.id, receiptFileId: input.receiptFileId ?? null, updatedAt: new Date() })
      .where(eq(gifts.id, giftId));
    await tx
      .update(wishlistReservations)
      .set({ status: "purchased", updatedAt: new Date() })
      .where(and(eq(wishlistReservations.giftId, giftId), eq(wishlistReservations.status, "active")));
    await writeAudit(tx, { groupId: locked.groupId, entityType: "gift", entityId: giftId, action: "purchase", actor, after: { expenseId: rec.expense.id, total: input.total, shares }, spaceId: locked.spaceId });
    return { expenseId: rec.expense.id };
  });
}

/**
 * Cancels a gift. Before purchase, money already collected stays as each person's credit in the
 * space ledger until the holder refunds it (purpose "refund"). After purchase, the purchase must
 * first be fully refunded through "برگشت خرید".
 */
export async function cancelGift(actor: Actor, giftId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const { gift, member, isAdmin: admin } = await requireGiftAccess(tx, actor, giftId);
    if (!canManage(gift, actor, member.id, admin)) throw forbidden();
    await lockGroup(tx, gift.groupId);
    const locked = await loadGift(tx, giftId, true);
    if (locked.status === "cancelled" || locked.status === "delivered") throw invalid("این هدیه قابل لغو نیست.");
    if (locked.status === "purchased") {
      const ledger = await loadGroupLedger(tx, locked.groupId, { kind: "space", spaceId: locked.spaceId });
      const net = ledger.expenses
        .filter((e) => e.giftId === giftId && !e.deleted)
        .reduce((a, e) => a + (e.kind === "refund" ? -e.totalAmount : e.totalAmount), 0n);
      if (net > 0n) throw invalid("ابتدا مبلغ خرید را با «برگشت خرید» کامل برگردانید، بعد هدیه را لغو کنید.");
    }
    await tx.update(gifts).set({ status: "cancelled", updatedAt: new Date() }).where(eq(gifts.id, giftId));
    await tx
      .update(wishlistReservations)
      .set({ status: "released", updatedAt: new Date() })
      .where(and(eq(wishlistReservations.giftId, giftId), inArray(wishlistReservations.status, ["active", "purchased"])));
    await writeAudit(tx, { groupId: locked.groupId, entityType: "gift", entityId: giftId, action: "cancel", actor, before: { status: locked.status }, spaceId: locked.spaceId });
    const pledgers = await tx.select({ memberId: giftPledges.memberId }).from(giftPledges).where(eq(giftPledges.giftId, giftId));
    await notifyMembers(tx, locked.groupId, pledgers.map((p) => p.memberId), actor, "gift_status", { giftId, spaceId: locked.spaceId, title: locked.title, status: "cancelled" }, { spaceId: locked.spaceId });
  });
}

export const reallocateInput = z.object({ toGiftId: id, amount: amountString });

/**
 * A contributor explicitly moves their unspent credit from one gift to another. Only the owner of
 * the money can do it, and only when both gifts are held by the same person (the money does not
 * physically move). The space ledger is unchanged; only per-gift attribution changes.
 */
export async function reallocateCredit(actor: Actor, fromGiftId: string, raw: z.input<typeof reallocateInput>): Promise<void> {
  const input = reallocateInput.parse(raw);
  await getDb().transaction(async (tx) => {
    const { gift: from, member } = await requireGiftAccess(tx, actor, fromGiftId);
    await lockGroup(tx, from.groupId);
    const to = await loadGift(tx, input.toGiftId);
    if (to.spaceId !== from.spaceId || to.id === from.id) throw invalid("هدیه مقصد معتبر نیست.");
    if (to.buyerMemberId !== from.buyerMemberId) throw invalid("انتقال فقط وقتی ممکن است که پول نزد همان مسئول خرید باشد.");
    if (to.status === "cancelled" || to.status === "delivered" || to.status === "purchased") throw invalid("هدیه مقصد دیگر پرداخت جدید نمی‌پذیرد.");
    const view = await giftViewData(tx, from);
    const mine = view.ledger.perMember.find((m) => m.memberId === member.id);
    const credit = mine ? -mine.remaining : 0n;
    const spendable = from.status === "cancelled" ? (mine?.paid ?? 0n) : credit;
    if (input.amount > spendable) throw invalid(`حداکثر قابل انتقال ${formatToman(spendable > 0n ? spendable : 0n)} است.`);
    await tx.insert(giftReallocations).values({ memberId: member.id, fromGiftId: from.id, toGiftId: to.id, amount: input.amount, createdBy: actor.userId });
    await writeAudit(tx, { groupId: from.groupId, entityType: "gift", entityId: from.id, action: "reallocate", actor, after: { toGiftId: to.id, amount: input.amount }, spaceId: from.spaceId });
  });
}

async function giftViewData(tx: Tx, gift: typeof gifts.$inferSelect) {
  const [pledges, ledger, reallocations] = await Promise.all([
    tx.select().from(giftPledges).where(eq(giftPledges.giftId, gift.id)),
    loadGroupLedger(tx, gift.groupId, { kind: "space", spaceId: gift.spaceId }),
    tx.select().from(giftReallocations).where(inArray(giftReallocations.fromGiftId, [gift.id])),
  ]);
  const incoming = await tx.select().from(giftReallocations).where(eq(giftReallocations.toGiftId, gift.id));
  const pledged = pledges.filter((p) => p.status === "pledged").map((p) => ({ memberId: p.memberId, amount: p.amount! }));
  const view = giftLedgerView(gift.id, pledged, ledger.expenses, ledger.settlements, [...reallocations, ...incoming]);
  return { pledges, ledger: view, settlementsForGift: ledger.settlements.filter((s) => s.giftId === gift.id) };
}

export async function getGiftView(actor: Actor, giftId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const { gift, member, isAdmin: admin } = await requireGiftAccess(tx, actor, giftId);
    const data = await giftViewData(tx, gift);
    const names = await tx
      .select({ id: groupMembers.id, name: groupMembers.displayName, userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, gift.groupId));
    const settlementRows = await tx.select().from(settlements).where(eq(settlements.giftId, giftId)).orderBy(desc(settlements.createdAt));
    const byId = new Map(names.map((n) => [n.id, n]));
    const invitedOrPledged = data.pledges.filter((p) => p.status !== "declined").map((p) => p.memberId);
    const otherGifts = await tx
      .select({ id: gifts.id, title: gifts.title, status: gifts.status, buyerMemberId: gifts.buyerMemberId })
      .from(gifts)
      .where(eq(gifts.spaceId, gift.spaceId));
    let item = null;
    if (gift.wishlistItemId) {
      [item] = await tx.select().from(wishlistItems).where(eq(wishlistItems.id, gift.wishlistItemId));
    }
    return {
      gift,
      item,
      me: { memberId: member.id, canManage: canManage(gift, actor, member.id, admin), isBuyer: member.id === gift.buyerMemberId },
      names: byId,
      pledges: data.pledges,
      myPledge: data.pledges.find((p) => p.memberId === member.id) ?? null,
      suggestedShares: gift.budget ? suggestEqualShares(gift.budget, invitedOrPledged) : [],
      ledger: data.ledger,
      settlements: settlementRows.map((s) => {
        const receiver = byId.get(s.toMemberId);
        return { ...s, canDecide: s.status === "pending" && (receiver?.userId ? receiver.userId === actor.userId : admin) };
      }),
      reallocationTargets: otherGifts.filter(
        (g) => g.id !== gift.id && g.buyerMemberId === gift.buyerMemberId && !["cancelled", "delivered", "purchased"].includes(g.status),
      ),
    };
  });
}

export function giftDomainMessage(err: unknown): string | null {
  return err instanceof DomainError ? err.message : null;
}
