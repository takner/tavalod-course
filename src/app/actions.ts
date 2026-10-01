"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { amountFromJson } from "@/domain/money";
import { clearSessionCookie, readSessionToken, requireActor, setSessionCookie } from "@/lib/session";
import { appUrl, consumeLoginToken, deleteSession, requestLoginLink, safeNextPath, updateProfileName } from "@/server/auth";
import { toAppError } from "@/server/errors";
import { changeEventStatus, createEvent, setParticipants } from "@/server/events";
import { createRefund, deleteExpense, updateExpense } from "@/server/expenses";
import {
  acceptInvite,
  addGuestMember,
  createClaimInvite,
  createGroup,
  createGroupInvite,
  removeMember,
  renameMember,
  revokeInvite,
  setMemberRole,
} from "@/server/groups";
import { markNotificationsRead } from "@/server/queries";
import { decideSettlement, previewAllocation } from "@/server/settlements";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
  link?: string;
}

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; state: ActionState }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const e = toAppError(err);
    if (e.code === "INTERNAL") console.error("action failed:", err);
    return { ok: false, state: { ok: false, error: e.message } };
  }
}

const str = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

const groupPath = (groupId: string) => `/groups/${groupId}`;

// ───────────────────────── auth ─────────────────────────

export async function requestLoginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await attempt(() => requestLoginLink(str(fd, "email"), str(fd, "next") || null));
  if (!r.ok) return r.state;
  return { ok: true, message: "لینک ورود به ایمیل شما فرستاده شد. صندوق ورودی (و هرزنامه) را بررسی کنید." };
}

export async function verifyLoginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await attempt(() => consumeLoginToken(str(fd, "token")));
  if (!r.ok) return r.state;
  await setSessionCookie(r.value.sessionToken);
  redirect(safeNextPath(r.value.nextPath) ?? (r.value.isNewUser ? "/me?welcome=1" : "/groups"));
}

export async function logoutAction(): Promise<void> {
  await deleteSession(await readSessionToken());
  await clearSessionCookie();
  redirect("/login");
}

export async function updateNameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { userId } = await requireActor();
  const r = await attempt(() => updateProfileName(userId, str(fd, "name")));
  if (!r.ok) return r.state;
  revalidatePath("/", "layout");
  return { ok: true, message: "نام شما ذخیره شد." };
}

// ───────────────────────── groups & members ─────────────────────────

export async function createGroupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => createGroup(actor, str(fd, "name")));
  if (!r.ok) return r.state;
  redirect(groupPath(r.value.groupId));
}

export async function addGuestAction(groupId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => addGuestMember(actor, groupId, str(fd, "name")));
  if (!r.ok) return r.state;
  revalidatePath(groupPath(groupId), "layout");
  return { ok: true, message: "عضو مهمان اضافه شد." };
}

export async function renameMemberAction(groupId: string, memberId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => renameMember(actor, groupId, memberId, str(fd, "name")));
  if (!r.ok) return r.state;
  revalidatePath(groupPath(groupId), "layout");
  return { ok: true, message: "ذخیره شد." };
}

export async function removeMemberAction(groupId: string, memberId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => removeMember(actor, groupId, memberId));
  if (!r.ok) return r.state;
  revalidatePath(groupPath(groupId), "layout");
  return { ok: true, message: "عضو از گروه خارج شد." };
}

export async function setRoleAction(groupId: string, memberId: string, role: "admin" | "member", _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => setMemberRole(actor, groupId, memberId, role));
  if (!r.ok) return r.state;
  revalidatePath(groupPath(groupId), "layout");
  return { ok: true };
}

export async function createGroupInviteAction(groupId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => createGroupInvite(actor, groupId));
  if (!r.ok) return r.state;
  revalidatePath(`${groupPath(groupId)}/members`);
  return { ok: true, link: `${appUrl()}/invite/${r.value.token}`, message: "لینک دعوت ساخته شد (۷ روز معتبر)." };
}

export async function createClaimInviteAction(
  groupId: string,
  memberId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const email = str(fd, "email").trim();
  const r = await attempt(() => createClaimInvite(actor, groupId, memberId, email || undefined));
  if (!r.ok) return r.state;
  revalidatePath(`${groupPath(groupId)}/members`);
  return {
    ok: true,
    link: `${appUrl()}/invite/${r.value.token}`,
    message: "لینک اختصاصی ساخته شد: فقط یک بار و تا ۳ روز قابل استفاده است. آن را فقط برای همین شخص بفرستید.",
  };
}

export async function revokeInviteAction(groupId: string, inviteId: string): Promise<void> {
  const actor = await requireActor();
  await revokeInvite(actor, groupId, inviteId);
  revalidatePath(`${groupPath(groupId)}/members`);
}

export async function acceptInviteAction(token: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => acceptInvite(actor, token));
  if (!r.ok) return r.state;
  redirect(groupPath(r.value.groupId));
}

// ───────────────────────── events ─────────────────────────

export async function createEventAction(groupId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() =>
    createEvent(actor, {
      groupId,
      title: str(fd, "title"),
      type: str(fd, "type") || "other",
      startDate: str(fd, "startDate") || null,
      endDate: str(fd, "endDate") || null,
      participantMemberIds: fd.getAll("participants").filter((v): v is string => typeof v === "string"),
    }),
  );
  if (!r.ok) return r.state;
  redirect(`${groupPath(groupId)}/events/${r.value.eventId}`);
}

export async function setParticipantsAction(groupId: string, eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const ids = fd.getAll("participants").filter((v): v is string => typeof v === "string");
  const r = await attempt(() => setParticipants(actor, eventId, ids));
  if (!r.ok) return r.state;
  revalidatePath(`${groupPath(groupId)}/events/${eventId}`);
  return { ok: true, message: "شرکت‌کنندگان ذخیره شدند." };
}

export async function changeEventStatusAction(
  groupId: string,
  eventId: string,
  action: "close" | "reopen" | "cancel",
  _prev: ActionState,
): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => changeEventStatus(actor, eventId, action));
  if (!r.ok) return r.state;
  revalidatePath(groupPath(groupId), "layout");
  return { ok: true };
}

// ───────────────────────── expenses ─────────────────────────

export async function updateExpenseAction(
  groupId: string,
  expenseId: string,
  version: number,
  payload: unknown,
): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => updateExpense(actor, expenseId, version, payload));
  if (!r.ok) return r.state;
  revalidatePath(groupPath(groupId), "layout");
  redirect(`${groupPath(groupId)}/expenses/${expenseId}`);
}

export async function deleteExpenseAction(groupId: string, expenseId: string, version: number, _prev: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => deleteExpense(actor, expenseId, version));
  if (!r.ok) return r.state;
  revalidatePath(groupPath(groupId), "layout");
  return { ok: true, message: "هزینه حذف شد. سابقه آن نگه داشته می‌شود." };
}

export async function createRefundAction(
  groupId: string,
  expenseId: string,
  clientKey: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const receiver = str(fd, "receiver");
  const amount = str(fd, "amount");
  const r = await attempt(() =>
    createRefund(
      actor,
      {
        expenseId,
        amount,
        date: str(fd, "date"),
        note: str(fd, "note") || undefined,
        receivers: receiver ? [{ memberId: receiver, amount }] : undefined,
      },
      clientKey,
    ),
  );
  if (!r.ok) return r.state;
  revalidatePath(groupPath(groupId), "layout");
  redirect(`${groupPath(groupId)}/expenses/${expenseId}`);
}

// ───────────────────────── settlements ─────────────────────────

export async function decideSettlementAction(
  groupId: string,
  settlementId: string,
  decision: "confirm" | "reject",
  _prev: ActionState,
): Promise<ActionState> {
  const actor = await requireActor();
  const r = await attempt(() => decideSettlement(actor, settlementId, decision));
  if (!r.ok) return r.state;
  revalidatePath("/", "layout");
  return { ok: true, message: decision === "confirm" ? "دریافت تأیید شد." : "تسویه رد شد." };
}

export async function previewAllocationAction(
  groupId: string,
  fromMemberId: string,
  toMemberId: string,
  amount: string,
): Promise<{ ok: true; allocations: { eventId: string | null; amount: string }[] } | { ok: false; error: string }> {
  const actor = await requireActor();
  const r = await attempt(() => previewAllocation(actor, groupId, fromMemberId, toMemberId, amountFromJson(amount)));
  if (!r.ok) return { ok: false, error: r.state.error ?? "" };
  return { ok: true, allocations: r.value.map((a) => ({ eventId: a.eventId, amount: a.amount.toString() })) };
}

// ───────────────────────── notifications ─────────────────────────

export async function markNotificationsReadAction(): Promise<void> {
  const actor = await requireActor();
  await markNotificationsRead(actor);
  revalidatePath("/", "layout");
}

