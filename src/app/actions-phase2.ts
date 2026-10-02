"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appUrl } from "@/server/auth";
import { createBirthday, updateMyBirthday } from "@/server/birthdays";
import { createTask, deleteTask, setRsvp, setTaskDone, updateCakeSettings, updateEventDetails } from "@/server/event-planning";
import { saveImage } from "@/server/files";
import {
  cancelGift,
  createGift,
  inviteContributors,
  reallocateCredit,
  recordPurchase,
  respondPledge,
  setGiftStatus,
} from "@/server/gift-plans";
import { closePoll, createPoll, decidePoll, vote } from "@/server/polls";
import { createSettlement } from "@/server/settlements";
import { addSpaceMembers, createSpace, postSpaceMessage } from "@/server/spaces";
import {
  addItem,
  createWishlist,
  deleteItem,
  deleteWishlist,
  enableShareLink,
  markReservationPurchased,
  releaseReservation,
  reserveItem,
  revokeShareLink,
  updateItem,
  updateWishlist,
} from "@/server/wishlists";
import { requireActor } from "@/lib/session";
import type { GiftStatus } from "@/domain/gifts";
import { toAsciiDigits } from "@/domain/money";
import { attempt, optFile, str, strs } from "./action-utils";
import type { ActionState } from "./actions";

const g = (groupId: string) => `/groups/${groupId}`;

// ───────────────────────── profile ─────────────────────────

export async function updateBirthdayAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const clear = str(fd, "clear") === "1";
  const r = await attempt(() =>
    updateMyBirthday(
      actor,
      clear ? null : { calendar: (str(fd, "calendar") || "jalali") as "jalali" | "gregorian", month: str(fd, "month"), day: str(fd, "day"), year: str(fd, "year") },
    ),
  );
  if (!r.ok) return r.state;
  revalidatePath("/", "layout");
  return { ok: true, message: clear ? "تاریخ تولد حذف شد." : "تاریخ تولد ذخیره شد." };
}

// ───────────────────────── wishlists ─────────────────────────

export async function createWishlistAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => createWishlist(actor, { title: str(fd, "title"), description: str(fd, "description"), groupIds: strs(fd, "groupIds") }));
  if (!r.ok) return r.state;
  redirect(`/wishlists/${r.value.wishlistId}`);
}

export async function updateWishlistAction(wishlistId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => updateWishlist(actor, wishlistId, { title: str(fd, "title"), description: str(fd, "description"), groupIds: strs(fd, "groupIds") }));
  if (!r.ok) return r.state;
  revalidatePath(`/wishlists/${wishlistId}`);
  return { ok: true, message: "ذخیره شد." };
}

export async function enableShareLinkAction(wishlistId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => enableShareLink(actor, wishlistId));
  if (!r.ok) return r.state;
  revalidatePath(`/wishlists/${wishlistId}`);
  return { ok: true, link: `${appUrl()}/w/${r.value.token}`, message: "لینک جدید ساخته شد؛ لینک قبلی (اگر بود) دیگر کار نمی‌کند." };
}

export async function revokeShareLinkAction(wishlistId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => revokeShareLink(actor, wishlistId));
  if (!r.ok) return r.state;
  revalidatePath(`/wishlists/${wishlistId}`);
  return { ok: true, message: "لینک اشتراک لغو شد." };
}

export async function deleteWishlistAction(wishlistId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => deleteWishlist(actor, wishlistId));
  if (!r.ok) return r.state;
  redirect("/wishlists");
}

export async function saveItemAction(wishlistId: string, itemId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(async () => {
    const image = optFile(fd, "image");
    const imageFileId = image ? (await saveImage(actor, "wishlist", image)).fileId : str(fd, "keepImageId") || null;
    const input = {
      kind: (str(fd, "kind") || "product") as "product",
      title: str(fd, "title"),
      description: str(fd, "description"),
      brand: str(fd, "brand"),
      model: str(fd, "model"),
      color: str(fd, "color"),
      size: str(fd, "size"),
      specs: str(fd, "specs"),
      productUrl: str(fd, "productUrl"),
      priority: str(fd, "priority") || "2",
      status: (str(fd, "status") || "wanted") as "wanted",
      acceptsSubstitute: str(fd, "acceptsSubstitute") === "on",
      imageFileId,
      price: str(fd, "price"),
      priceObservedOn: str(fd, "priceObservedOn") || null,
      priceSource: (str(fd, "priceSource") || "manual") as "manual",
    };
    return itemId ? updateItem(actor, itemId, input) : addItem(actor, wishlistId, input);
  });
  if (!r.ok) return r.state;
  redirect(`/wishlists/${wishlistId}`);
}

export async function deleteItemAction(wishlistId: string, itemId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => deleteItem(actor, itemId));
  if (!r.ok) return r.state;
  redirect(`/wishlists/${wishlistId}`);
}

export async function reserveAction(groupId: string, listId: string, itemId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => reserveItem(actor, { groupId, itemId, deadlineDate: str(fd, "deadline") || null, note: str(fd, "note") }));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/wishlists/${listId}`);
  return { ok: true, message: "برای شما رزرو شد." };
}

export async function releaseReservationAction(groupId: string, listId: string, reservationId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => releaseReservation(actor, reservationId));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/wishlists/${listId}`);
  return { ok: true };
}

export async function markPurchasedAction(groupId: string, listId: string, reservationId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => markReservationPurchased(actor, reservationId));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/wishlists/${listId}`);
  return { ok: true };
}

// ───────────────────────── birthdays & events ─────────────────────────

export async function createBirthdayAction(groupId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() =>
    createBirthday(actor, {
      groupId,
      celebrantMemberId: str(fd, "celebrant"),
      date: str(fd, "date"),
      time: str(fd, "time") || null,
      title: str(fd, "title"),
      createSurprise: str(fd, "createSurprise") === "on",
      addChecklist: str(fd, "addChecklist") === "on",
    }),
  );
  if (!r.ok) return r.state;
  redirect(`${g(groupId)}/events/${r.value.eventId}`);
}

export async function updateEventDetailsAction(groupId: string, eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() =>
    updateEventDetails(actor, eventId, {
      title: str(fd, "title"),
      type: (str(fd, "type") || "other") as "other",
      description: str(fd, "description"),
      date: str(fd, "date") || null,
      time: str(fd, "time") || null,
      endDate: str(fd, "endDate") || null,
      locationName: str(fd, "locationName"),
      locationNote: str(fd, "locationNote"),
      mapUrl: str(fd, "mapUrl"),
      rsvpDeadlineDate: str(fd, "rsvpDeadline") || null,
      celebrantMemberId: str(fd, "celebrant") || null,
      finalAdults: str(fd, "finalAdults"),
      finalChildren: str(fd, "finalChildren"),
      budgets: { food: str(fd, "budget_food"), cake: str(fd, "budget_cake"), venue: str(fd, "budget_venue"), other: str(fd, "budget_other") },
    }),
  );
  if (!r.ok) return r.state;
  revalidatePath(g(groupId), "layout");
  redirect(`${g(groupId)}/events/${eventId}`);
}

export async function rsvpAction(groupId: string, eventId: string, forMemberId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() =>
    setRsvp(
      actor,
      eventId,
      {
        status: (str(fd, "status") || "going") as "going",
        adultCompanions: str(fd, "adultCompanions") || "0",
        childCompanions: str(fd, "childCompanions") || "0",
        note: str(fd, "note"),
      },
      forMemberId ?? undefined,
    ),
  );
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/events/${eventId}`);
  return { ok: true, message: "پاسخ حضور ثبت شد." };
}

export async function cakeAction(groupId: string, eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() =>
    updateCakeSettings(actor, eventId, {
      adultGrams: str(fd, "adultGrams"),
      childGrams: str(fd, "childGrams"),
      marginPercent: str(fd, "marginPercent"),
      roundStepGrams: str(fd, "roundStepGrams"),
      orderGrams: str(fd, "orderGrams"),
    }),
  );
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/events/${eventId}`, "layout");
  return { ok: true, message: "ذخیره شد." };
}

export async function createTaskAction(groupId: string, eventId: string, spaceId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() =>
    createTask(actor, eventId, { title: str(fd, "title"), assigneeMemberId: str(fd, "assignee") || null, dueDate: str(fd, "dueDate") || null, spaceId }),
  );
  if (!r.ok) return r.state;
  revalidatePath(g(groupId), "layout");
  return { ok: true, message: "کار اضافه شد." };
}

export async function toggleTaskAction(groupId: string, taskId: string, done: boolean, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => setTaskDone(actor, taskId, done));
  if (!r.ok) return r.state;
  revalidatePath(g(groupId), "layout");
  return { ok: true };
}

export async function deleteTaskAction(groupId: string, taskId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => deleteTask(actor, taskId));
  if (!r.ok) return r.state;
  revalidatePath(g(groupId), "layout");
  return { ok: true };
}

// ───────────────────────── private spaces & gifts ─────────────────────────

export async function createSpaceAction(groupId: string, eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => createSpace(actor, { eventId, title: str(fd, "title"), memberIds: strs(fd, "members") }));
  if (!r.ok) return r.state;
  redirect(`${g(groupId)}/spaces/${r.value.spaceId}`);
}

export async function addSpaceMembersAction(groupId: string, spaceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => addSpaceMembers(actor, spaceId, strs(fd, "members")));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/spaces/${spaceId}`);
  return { ok: true, message: "اضافه شد." };
}

export async function postMessageAction(groupId: string, spaceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => postSpaceMessage(actor, spaceId, str(fd, "body")));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/spaces/${spaceId}`);
  return { ok: true };
}

export async function createGiftAction(groupId: string, spaceId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() =>
    createGift(actor, {
      spaceId,
      title: str(fd, "title"),
      description: str(fd, "description"),
      productUrl: str(fd, "productUrl"),
      wishlistItemId: str(fd, "wishlistItemId") || null,
      budget: str(fd, "budget"),
      deadlineDate: str(fd, "deadline") || null,
      buyerMemberId: str(fd, "buyer"),
      contributorIds: strs(fd, "contributors"),
    }),
  );
  if (!r.ok) return r.state;
  redirect(`${g(groupId)}/spaces/${spaceId}/gifts/${r.value.giftId}`);
}

const giftPath = (groupId: string, spaceId: string, giftId: string) => `${g(groupId)}/spaces/${spaceId}/gifts/${giftId}`;

export async function pledgeAction(groupId: string, spaceId: string, giftId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const decision = str(fd, "decision") === "decline" ? "decline" : "pledge";
  const r = await attempt(() => respondPledge(actor, giftId, { decision, amount: str(fd, "amount") }));
  if (!r.ok) return r.state;
  revalidatePath(giftPath(groupId, spaceId, giftId));
  return { ok: true, message: decision === "pledge" ? "تعهد شما ثبت شد. تعهد پول جابه‌جا نمی‌کند و بدهی نمی‌سازد." : "ثبت شد که مشارکت نمی‌کنید." };
}

export async function inviteContributorsAction(groupId: string, spaceId: string, giftId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => inviteContributors(actor, giftId, strs(fd, "contributors")));
  if (!r.ok) return r.state;
  revalidatePath(giftPath(groupId, spaceId, giftId));
  return { ok: true };
}

export async function giftStatusAction(groupId: string, spaceId: string, giftId: string, status: GiftStatus, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => setGiftStatus(actor, giftId, status));
  if (!r.ok) return r.state;
  revalidatePath(giftPath(groupId, spaceId, giftId));
  return { ok: true };
}

export async function purchaseAction(groupId: string, spaceId: string, giftId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(async () => {
    const receipt = optFile(fd, "receipt");
    const receiptFileId = receipt ? (await saveImage(actor, "receipt", receipt)).fileId : null;
    const custom = str(fd, "splitMode") === "custom";
    const amounts = fd.getAll("shareAmount").map((v) => (typeof v === "string" ? v.replace(/[^\d۰-۹٠-٩]/g, "") : ""));
    const customShares = custom
      ? fd.getAll("shareMember").map((memberId, i) => ({ memberId: String(memberId), amount: toAsciiDigits(amounts[i] ?? "") || "0" }))
      : undefined;
    return recordPurchase(actor, giftId, { total: str(fd, "total"), date: str(fd, "date"), note: str(fd, "note"), receiptFileId, customShares });
  });
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/spaces/${spaceId}`, "layout");
  return { ok: true, message: "خرید ثبت شد." };
}

export async function cancelGiftAction(groupId: string, spaceId: string, giftId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => cancelGift(actor, giftId));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/spaces/${spaceId}`, "layout");
  return { ok: true, message: "هدیه لغو شد. پول‌های وصول‌شده تا بازپرداخت، به‌عنوان طلب صاحبانش باقی می‌ماند." };
}

export async function reallocateAction(groupId: string, spaceId: string, giftId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => reallocateCredit(actor, giftId, { toGiftId: str(fd, "toGiftId"), amount: str(fd, "amount") }));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/spaces/${spaceId}`, "layout");
  return { ok: true, message: "اعتبار شما به هدیه انتخاب‌شده منتقل شد." };
}

/** Gift money transfer (pay-in to the holder or refund from the holder). Online only, idempotent by key. */
export async function giftPaymentAction(
  groupId: string,
  spaceId: string,
  giftId: string,
  purpose: "collection" | "refund",
  clientKey: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() =>
    createSettlement(
      actor,
      { groupId, spaceId, giftId, purpose, fromMemberId: str(fd, "from"), toMemberId: str(fd, "to"), amount: str(fd, "amount"), method: (str(fd, "method") || "bank_transfer") as "cash", note: str(fd, "note") || undefined },
      clientKey,
    ),
  );
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/spaces/${spaceId}`, "layout");
  return {
    ok: true,
    message: r.value.status === "confirmed" ? "ثبت و تأیید شد." : "ثبت شد؛ تا تأیید دریافت‌کننده «وصول‌شده» حساب نمی‌شود.",
  };
}

// ───────────────────────── polls ─────────────────────────

export async function createPollAction(groupId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const kind = (str(fd, "kind") || "custom") as "datetime" | "place" | "activity" | "budget" | "gift" | "custom";
  const labels = strs(fd, "optionLabel");
  const dates = fd.getAll("optionDate").map(String);
  const times = fd.getAll("optionTime").map(String);
  const r = await attempt(() =>
    createPoll(actor, {
      groupId,
      eventId: str(fd, "eventId") || null,
      spaceId: str(fd, "spaceId") || null,
      kind,
      question: str(fd, "question"),
      multi: str(fd, "multi") === "on",
      resultsMode: str(fd, "aggregate") === "on" ? "aggregate" : "public",
      deadlineDate: str(fd, "deadlineDate") || null,
      deadlineTime: str(fd, "deadlineTime") || null,
      options:
        kind === "datetime"
          ? dates.map((date, i) => ({ label: "", date: date || null, time: times[i] || null })).filter((o) => o.date)
          : labels.map((label) => ({ label })),
    }),
  );
  if (!r.ok) return r.state;
  redirect(`${g(groupId)}/polls/${r.value.pollId}`);
}

export async function voteAction(groupId: string, pollId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => vote(actor, pollId, strs(fd, "option")));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/polls/${pollId}`);
  return { ok: true, message: "رأی شما ثبت شد. تا پایان مهلت می‌توانید آن را تغییر دهید." };
}

export async function closePollAction(groupId: string, pollId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => closePoll(actor, pollId));
  if (!r.ok) return r.state;
  revalidatePath(`${g(groupId)}/polls/${pollId}`);
  return { ok: true };
}

export async function decidePollAction(groupId: string, pollId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => decidePoll(actor, pollId, str(fd, "option"), str(fd, "note"), str(fd, "apply") === "on"));
  if (!r.ok) return r.state;
  revalidatePath(g(groupId), "layout");
  return { ok: true, message: "تصمیم نهایی اعلام شد." };
}
