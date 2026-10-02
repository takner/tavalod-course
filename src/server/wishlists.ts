import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx, type Tx } from "@/db";
import {
  files,
  groupMembers,
  groups,
  priceObservations,
  users,
  wishlistGroups,
  wishlistItems,
  wishlistReservations,
  wishlists,
} from "@/db/schema";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/domain/calendar";
import { MAX_AMOUNT } from "@/domain/money";
import { assertId, requireMember, type Actor } from "./access";
import { snapshot } from "./audit";
import { randomToken, sha256 } from "./crypto";
import { AppError, forbidden, invalid, notFound } from "./errors";
import { id, isoDate } from "./inputs";
import { validatePublicHttpUrl } from "./net/safe-url";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const wishlistInput = z.object({
  title: z.string().trim().min(1, "عنوان فهرست را وارد کنید.").max(80),
  description: optionalText(500),
  groupIds: z.array(id).max(50),
});

export const itemInput = z.object({
  kind: z.enum(["product", "digital", "ticket", "experience", "other"]),
  title: z.string().trim().min(1, "عنوان را وارد کنید.").max(120),
  description: optionalText(1000),
  brand: optionalText(80),
  model: optionalText(120),
  color: optionalText(60),
  size: optionalText(60),
  specs: optionalText(500),
  productUrl: optionalText(2000),
  priority: z.coerce.number().int().min(1).max(3),
  status: z.enum(["wanted", "received", "not_wanted"]),
  acceptsSubstitute: z.boolean(),
  imageFileId: id.nullable().optional(),
  /** Observed price (Toman) with when/where it was seen. */
  price: z
    .string()
    .regex(/^\d{0,16}$/, "قیمت معتبر نیست.")
    .optional()
    .transform((v) => (v ? BigInt(v) : null))
    .refine((v) => v === null || (v > 0n && v <= MAX_AMOUNT), "قیمت معتبر نیست."),
  priceObservedOn: isoDate.nullable().optional(),
  priceSource: z.enum(["manual", "store_page"]).optional(),
});
export type ItemInput = z.input<typeof itemInput>;

// ───────────────────────── owner side ─────────────────────────

async function requireOwnList(db: DbOrTx, actor: Actor, wishlistId: string) {
  assertId(wishlistId, "فهرست");
  const [list] = await db.select().from(wishlists).where(and(eq(wishlists.id, wishlistId), isNull(wishlists.deletedAt))).limit(1);
  if (!list || list.ownerUserId !== actor.userId) throw notFound("فهرست");
  return list;
}

async function assertMemberOfGroups(db: DbOrTx, actor: Actor, groupIds: string[]) {
  for (const g of new Set(groupIds)) await requireMember(db, g, actor);
}

export async function createWishlist(actor: Actor, raw: z.input<typeof wishlistInput>): Promise<{ wishlistId: string }> {
  const input = wishlistInput.parse(raw);
  return getDb().transaction(async (tx) => {
    await assertMemberOfGroups(tx, actor, input.groupIds);
    const [list] = await tx
      .insert(wishlists)
      .values({ ownerUserId: actor.userId, title: input.title, description: input.description })
      .returning();
    if (input.groupIds.length) {
      await tx.insert(wishlistGroups).values([...new Set(input.groupIds)].map((groupId) => ({ wishlistId: list.id, groupId })));
    }
    return { wishlistId: list.id };
  });
}

/** Title, description and which of the owner's groups may see the list ("only me" = no groups). */
export async function updateWishlist(actor: Actor, wishlistId: string, raw: z.input<typeof wishlistInput>): Promise<void> {
  const input = wishlistInput.parse(raw);
  await getDb().transaction(async (tx) => {
    await requireOwnList(tx, actor, wishlistId);
    await assertMemberOfGroups(tx, actor, input.groupIds);
    await tx.update(wishlists).set({ title: input.title, description: input.description, updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
    await tx.delete(wishlistGroups).where(eq(wishlistGroups.wishlistId, wishlistId));
    if (input.groupIds.length) {
      await tx.insert(wishlistGroups).values([...new Set(input.groupIds)].map((groupId) => ({ wishlistId, groupId })));
    }
  });
}

/** Creates (or replaces) the public link; the previous link stops working immediately. */
export async function enableShareLink(actor: Actor, wishlistId: string): Promise<{ token: string }> {
  await requireOwnList(getDb(), actor, wishlistId);
  const token = randomToken();
  await getDb().update(wishlists).set({ shareTokenHash: sha256(token), updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
  return { token };
}

export async function revokeShareLink(actor: Actor, wishlistId: string): Promise<void> {
  await requireOwnList(getDb(), actor, wishlistId);
  await getDb().update(wishlists).set({ shareTokenHash: null, updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
}

export async function deleteWishlist(actor: Actor, wishlistId: string): Promise<void> {
  await requireOwnList(getDb(), actor, wishlistId);
  await getDb()
    .update(wishlists)
    .set({ deletedAt: new Date(), shareTokenHash: null, updatedAt: new Date() })
    .where(eq(wishlists.id, wishlistId));
}

async function assertOwnImage(tx: Tx, actor: Actor, fileId: string | null | undefined) {
  if (!fileId) return;
  const [f] = await tx.select({ owner: files.ownerUserId, purpose: files.purpose }).from(files).where(eq(files.id, fileId)).limit(1);
  if (!f || f.owner !== actor.userId || f.purpose !== "wishlist") throw invalid("تصویر معتبر نیست.");
}

async function recordPrice(tx: Tx, actor: Actor, itemId: string, input: z.infer<typeof itemInput>, productUrl: string | null) {
  if (input.price === null) return;
  await tx.insert(priceObservations).values({
    itemId,
    amount: input.price,
    observedAt: input.priceObservedOn ? new Date(`${input.priceObservedOn}T12:00:00Z`) : new Date(),
    source: input.priceSource ?? "manual",
    sourceUrl: productUrl,
    recordedBy: actor.userId,
  });
}

export async function addItem(actor: Actor, wishlistId: string, raw: ItemInput): Promise<{ itemId: string }> {
  const input = itemInput.parse(raw);
  const productUrl = input.productUrl ? validatePublicHttpUrl(input.productUrl, "لینک کالا") : null;
  return getDb().transaction(async (tx) => {
    await requireOwnList(tx, actor, wishlistId);
    await assertOwnImage(tx, actor, input.imageFileId);
    const { price: _p, priceObservedOn: _o, priceSource: _s, ...fields } = input;
    const [item] = await tx
      .insert(wishlistItems)
      .values({ ...fields, imageFileId: input.imageFileId ?? null, productUrl, wishlistId })
      .returning();
    await recordPrice(tx, actor, item.id, input, productUrl);
    return { itemId: item.id };
  });
}

/** Edits never touch reservations, so other people's coordination history is preserved. */
export async function updateItem(actor: Actor, itemId: string, raw: ItemInput): Promise<void> {
  assertId(itemId, "آیتم");
  const input = itemInput.parse(raw);
  const productUrl = input.productUrl ? validatePublicHttpUrl(input.productUrl, "لینک کالا") : null;
  await getDb().transaction(async (tx) => {
    const [item] = await tx.select().from(wishlistItems).where(eq(wishlistItems.id, itemId)).limit(1);
    if (!item || item.deletedAt) throw notFound("آیتم");
    await requireOwnList(tx, actor, item.wishlistId);
    await assertOwnImage(tx, actor, input.imageFileId);
    const { price: _p, priceObservedOn: _o, priceSource: _s, ...fields } = input;
    await tx
      .update(wishlistItems)
      .set({ ...fields, imageFileId: input.imageFileId ?? null, productUrl, updatedAt: new Date() })
      .where(eq(wishlistItems.id, itemId));
    await recordPrice(tx, actor, itemId, input, productUrl);
  });
}

/** Soft delete: reservations and purchases by others keep their history. */
export async function deleteItem(actor: Actor, itemId: string): Promise<void> {
  assertId(itemId, "آیتم");
  await getDb().transaction(async (tx) => {
    const [item] = await tx.select().from(wishlistItems).where(eq(wishlistItems.id, itemId)).limit(1);
    if (!item || item.deletedAt) throw notFound("آیتم");
    await requireOwnList(tx, actor, item.wishlistId);
    await tx.update(wishlistItems).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(wishlistItems.id, itemId));
  });
}

async function latestPrices(db: DbOrTx, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, typeof priceObservations.$inferSelect>();
  const rows = await db
    .select()
    .from(priceObservations)
    .where(inArray(priceObservations.itemId, itemIds))
    .orderBy(desc(priceObservations.observedAt), desc(priceObservations.createdAt));
  const out = new Map<string, typeof priceObservations.$inferSelect>();
  for (const r of rows) if (!out.has(r.itemId)) out.set(r.itemId, r);
  return out;
}

export async function listMyWishlists(actor: Actor) {
  const db = getDb();
  const lists = await db
    .select()
    .from(wishlists)
    .where(and(eq(wishlists.ownerUserId, actor.userId), isNull(wishlists.deletedAt)))
    .orderBy(desc(wishlists.createdAt));
  const counts = lists.length
    ? await db
        .select({ wishlistId: wishlistItems.wishlistId, n: sql<number>`count(*)::int` })
        .from(wishlistItems)
        .where(and(inArray(wishlistItems.wishlistId, lists.map((l) => l.id)), isNull(wishlistItems.deletedAt)))
        .groupBy(wishlistItems.wishlistId)
    : [];
  const countBy = new Map(counts.map((c) => [c.wishlistId, c.n]));
  return lists.map((l) => ({ ...l, itemCount: countBy.get(l.id) ?? 0 }));
}

/** Owner view: deliberately contains NO reservation or purchase information. */
export async function getOwnWishlist(actor: Actor, wishlistId: string) {
  const db = getDb();
  const list = await requireOwnList(db, actor, wishlistId);
  const [items, groupRows, myGroups] = await Promise.all([
    db
      .select()
      .from(wishlistItems)
      .where(and(eq(wishlistItems.wishlistId, wishlistId), isNull(wishlistItems.deletedAt)))
      .orderBy(wishlistItems.priority, desc(wishlistItems.createdAt)),
    db.select({ groupId: wishlistGroups.groupId }).from(wishlistGroups).where(eq(wishlistGroups.wishlistId, wishlistId)),
    db
      .select({ id: groups.id, name: groups.name })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.userId, actor.userId), isNull(groupMembers.leftAt))),
  ]);
  const prices = await latestPrices(db, items.map((i) => i.id));
  return {
    list,
    items: items.map((i) => ({ ...i, price: prices.get(i.id) ?? null })),
    sharedGroupIds: groupRows.map((g) => g.groupId),
    myGroups,
    hasShareLink: list.shareTokenHash !== null,
  };
}

export async function getOwnItem(actor: Actor, itemId: string) {
  assertId(itemId, "آیتم");
  const db = getDb();
  const [item] = await db.select().from(wishlistItems).where(eq(wishlistItems.id, itemId)).limit(1);
  if (!item || item.deletedAt) throw notFound("آیتم");
  await requireOwnList(db, actor, item.wishlistId);
  const price = (await latestPrices(db, [itemId])).get(itemId) ?? null;
  return { item, price };
}

// ───────────────────────── viewers (group members) ─────────────────────────

/** Lists a group may see. The owner's own lists are included (without reservation data). */
export async function listGroupWishlists(actor: Actor, groupId: string) {
  const db = getDb();
  await requireMember(db, groupId, actor);
  return db
    .select({ id: wishlists.id, title: wishlists.title, ownerUserId: wishlists.ownerUserId, ownerName: users.name })
    .from(wishlistGroups)
    .innerJoin(wishlists, eq(wishlists.id, wishlistGroups.wishlistId))
    .innerJoin(users, eq(users.id, wishlists.ownerUserId))
    .where(and(eq(wishlistGroups.groupId, groupId), isNull(wishlists.deletedAt)))
    .orderBy(desc(wishlists.createdAt));
}

async function requireViewableInGroup(db: DbOrTx, actor: Actor, groupId: string, wishlistId: string) {
  assertId(wishlistId, "فهرست");
  await requireMember(db, groupId, actor);
  const [list] = await db
    .select({ list: wishlists })
    .from(wishlistGroups)
    .innerJoin(wishlists, eq(wishlists.id, wishlistGroups.wishlistId))
    .where(and(eq(wishlistGroups.groupId, groupId), eq(wishlistGroups.wishlistId, wishlistId), isNull(wishlists.deletedAt)))
    .limit(1);
  if (!list) throw notFound("فهرست");
  // The owner must still be a member of that group for the share to be valid.
  const [ownerMember] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, list.list.ownerUserId), isNull(groupMembers.leftAt)))
    .limit(1);
  if (!ownerMember) throw notFound("فهرست");
  return list.list;
}

export interface ReservationInfo {
  id: string;
  status: "active" | "purchased";
  byMe: boolean;
  reserverName: string;
  deadline: Date | null;
  note: string | null;
  viaGift: boolean;
}

/**
 * Group member's view of someone's list. Reservation details are included ONLY when the viewer
 * is not the owner, so the owner never learns who is buying what.
 */
export async function getWishlistInGroup(actor: Actor, groupId: string, wishlistId: string) {
  const db = getDb();
  const list = await requireViewableInGroup(db, actor, groupId, wishlistId);
  const isOwner = list.ownerUserId === actor.userId;
  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, list.ownerUserId));
  const items = await db
    .select()
    .from(wishlistItems)
    .where(eq(wishlistItems.wishlistId, wishlistId))
    .orderBy(wishlistItems.priority, desc(wishlistItems.createdAt));
  const prices = await latestPrices(db, items.map((i) => i.id));
  const reservations = new Map<string, ReservationInfo>();
  if (!isOwner && items.length) {
    const rows = await db
      .select({ r: wishlistReservations, name: users.name })
      .from(wishlistReservations)
      .innerJoin(users, eq(users.id, wishlistReservations.reserverUserId))
      .where(and(inArray(wishlistReservations.itemId, items.map((i) => i.id)), inArray(wishlistReservations.status, ["active", "purchased"])));
    for (const { r, name } of rows) {
      if (r.status === "active" && r.deadline && r.deadline.getTime() < Date.now()) continue; // lapsed
      reservations.set(r.itemId, {
        id: r.id,
        status: r.status as "active" | "purchased",
        byMe: r.reserverUserId === actor.userId,
        reserverName: name,
        deadline: r.deadline,
        note: r.note,
        viaGift: r.giftId !== null,
      });
    }
  }
  return {
    list,
    ownerName: owner?.name ?? "",
    isOwner,
    // Deleted items stay visible to a non-owner only if they hold a reservation, so it is not lost.
    items: items
      .filter((i) => !i.deletedAt || (!isOwner && reservations.get(i.id)?.byMe))
      .map((i) => ({ ...i, price: prices.get(i.id) ?? null, reservation: isOwner ? null : (reservations.get(i.id) ?? null) })),
  };
}

/** Public, read-only view via the share link: list content only, never reservations. */
export async function getSharedWishlist(token: string) {
  if (!token || token.length > 200) throw notFound("فهرست");
  const db = getDb();
  const [list] = await db
    .select()
    .from(wishlists)
    .where(and(eq(wishlists.shareTokenHash, sha256(token)), isNull(wishlists.deletedAt)))
    .limit(1);
  if (!list) throw notFound("فهرست");
  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, list.ownerUserId));
  const items = await db
    .select()
    .from(wishlistItems)
    .where(and(eq(wishlistItems.wishlistId, list.id), isNull(wishlistItems.deletedAt)))
    .orderBy(wishlistItems.priority, desc(wishlistItems.createdAt));
  const prices = await latestPrices(db, items.map((i) => i.id));
  return {
    list: { id: list.id, title: list.title, description: list.description },
    ownerName: owner?.name ?? "",
    items: items.map((i) => ({ ...i, price: prices.get(i.id) ?? null })),
  };
}

// ───────────────────────── reservations ─────────────────────────

export const reserveInput = z.object({
  groupId: id,
  itemId: id,
  deadlineDate: isoDate.nullable().optional(),
  note: z.string().trim().max(300).optional(),
});

/**
 * Exclusive reservation inside an existing transaction. The item row is locked FOR UPDATE and a
 * partial unique index guarantees at most one active/purchased reservation, so two concurrent
 * requests can never both win.
 */
export async function reserveItemInTx(
  tx: Tx,
  actor: Actor,
  input: { groupId: string; itemId: string; deadline: Date | null; note: string | null; giftId?: string | null },
): Promise<{ reservationId: string }> {
  const [item] = await tx.select().from(wishlistItems).where(eq(wishlistItems.id, input.itemId)).for("update").limit(1);
  if (!item || item.deletedAt) throw notFound("آیتم");
  const list = await requireViewableInGroup(tx, actor, input.groupId, item.wishlistId);
  if (list.ownerUserId === actor.userId) throw forbidden("آیتم‌های فهرست خودتان را نمی‌توانید رزرو کنید.");
  if (item.status !== "wanted") throw invalid("این آیتم دیگر در فهرست خواسته‌ها نیست.");
  // Lapsed reservations free the item.
  await tx
    .update(wishlistReservations)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(wishlistReservations.itemId, item.id), eq(wishlistReservations.status, "active"), lt(wishlistReservations.deadline, new Date())));
  try {
    const [r] = await tx
      .insert(wishlistReservations)
      .values({
        itemId: item.id,
        reserverUserId: actor.userId,
        groupId: input.groupId,
        giftId: input.giftId ?? null,
        deadline: input.deadline,
        note: input.note,
        itemSnapshot: snapshot({ title: item.title, brand: item.brand, model: item.model, color: item.color, size: item.size, productUrl: item.productUrl }) as object,
      })
      .returning({ id: wishlistReservations.id });
    return { reservationId: r.id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", "این آیتم همین حالا توسط شخص دیگری رزرو شده است.");
    }
    throw err;
  }
}

export async function reserveItem(actor: Actor, raw: z.input<typeof reserveInput>): Promise<{ reservationId: string }> {
  const input = reserveInput.parse(raw);
  const deadline = input.deadlineDate ? zonedTimeToUtc(input.deadlineDate, "23:59", DEFAULT_TIMEZONE) : null;
  return getDb().transaction((tx) => reserveItemInTx(tx, actor, { groupId: input.groupId, itemId: input.itemId, deadline, note: input.note || null }));
}

async function requireOwnReservation(tx: Tx, actor: Actor, reservationId: string) {
  assertId(reservationId, "رزرو");
  const [r] = await tx.select().from(wishlistReservations).where(eq(wishlistReservations.id, reservationId)).for("update").limit(1);
  if (!r || r.reserverUserId !== actor.userId) throw notFound("رزرو");
  await requireMember(tx, r.groupId, actor);
  return r;
}

export async function releaseReservation(actor: Actor, reservationId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const r = await requireOwnReservation(tx, actor, reservationId);
    if (r.giftId) throw invalid("این رزرو متعلق به یک هدیه گروهی است و با لغو همان هدیه آزاد می‌شود.");
    if (r.status !== "active") throw invalid("این رزرو فعال نیست.");
    await tx.update(wishlistReservations).set({ status: "released", updatedAt: new Date() }).where(eq(wishlistReservations.id, r.id));
  });
}

export async function markReservationPurchased(actor: Actor, reservationId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const r = await requireOwnReservation(tx, actor, reservationId);
    if (r.status !== "active") throw invalid("این رزرو فعال نیست.");
    await tx.update(wishlistReservations).set({ status: "purchased", updatedAt: new Date() }).where(eq(wishlistReservations.id, r.id));
  });
}

/** Wishlist items an actor may pick for a group gift (lists shared with the group, not their own). */
export async function giftableItems(actor: Actor, groupId: string) {
  const lists = await listGroupWishlists(actor, groupId);
  const others = lists.filter((l) => l.ownerUserId !== actor.userId);
  if (!others.length) return [];
  const db = getDb();
  const items = await db
    .select({ id: wishlistItems.id, title: wishlistItems.title, wishlistId: wishlistItems.wishlistId })
    .from(wishlistItems)
    .where(and(inArray(wishlistItems.wishlistId, others.map((l) => l.id)), isNull(wishlistItems.deletedAt), eq(wishlistItems.status, "wanted")));
  const owner = new Map(others.map((l) => [l.id, l.ownerName]));
  return items.map((i) => ({ ...i, ownerName: owner.get(i.wishlistId) ?? "" }));
}

/** postgres.js unique violation (possibly wrapped by drizzle in `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (e.code === "23505") return true;
  }
  return false;
}
