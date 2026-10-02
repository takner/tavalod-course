import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { eventBudgets, eventParticipants, eventTasks, events, groupMembers, privateSpaceMembers, privateSpaces } from "@/db/schema";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/domain/calendar";
import {
  assertId,
  isAdmin,
  requireActiveMembers,
  requireMember,
  requireSpaceMember,
  requireSpaceMembers,
  type Actor,
} from "./access";
import { notifyMembers, writeAudit } from "./audit";
import { forbidden, invalid, notFound } from "./errors";
import { id, isoDate } from "./inputs";
import { validatePublicHttpUrl } from "./net/safe-url";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "ساعت را به شکل ۲۰:۳۰ وارد کنید.");
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const intString = z
  .string()
  .regex(/^\d{0,9}$/)
  .optional()
  .transform((v) => (v ? Number(v) : null));
const moneyString = z
  .string()
  .regex(/^\d{0,15}$/, "مبلغ معتبر نیست.")
  .optional()
  .transform((v) => (v ? BigInt(v) : null));

export const BUDGET_CATEGORIES = ["food", "cake", "venue", "other"] as const;

export const eventDetailsInput = z.object({
  title: z.string().trim().min(1, "عنوان رویداد را وارد کنید.").max(120),
  type: z.enum(["trip", "birthday", "gathering", "charity", "other"]),
  description: optionalText(1000),
  date: isoDate.nullable(),
  time: hhmm.nullable(),
  endDate: isoDate.nullable(),
  locationName: optionalText(200),
  locationNote: optionalText(500),
  mapUrl: optionalText(2000),
  rsvpDeadlineDate: isoDate.nullable(),
  celebrantMemberId: id.nullable(),
  finalAdults: intString,
  finalChildren: intString,
  budgets: z.object({ food: moneyString, cake: moneyString, venue: moneyString, other: moneyString }),
});
export type EventDetailsInput = z.input<typeof eventDetailsInput>;

async function requireEventManager(eventId: string, actor: Actor) {
  assertId(eventId, "رویداد");
  const db = getDb();
  const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) throw notFound("رویداد");
  const me = await requireMember(db, ev.groupId, actor);
  if (ev.createdBy !== actor.userId && !isAdmin(me)) throw forbidden("فقط برگزارکننده یا مدیر گروه می‌تواند این را تغییر دهد.");
  return { ev, me };
}

/** Edits time (stored as UTC instant + zone), place, map link, RSVP deadline, celebrant, headcount and budget. */
export async function updateEventDetails(actor: Actor, eventId: string, raw: EventDetailsInput): Promise<void> {
  const input = eventDetailsInput.parse(raw);
  const { ev } = await requireEventManager(eventId, actor);
  const startsAt = input.date && input.time ? zonedTimeToUtc(input.date, input.time, DEFAULT_TIMEZONE) : null;
  const mapUrl = input.mapUrl ? validatePublicHttpUrl(input.mapUrl, "لینک نقشه") : null;
  const rsvpDeadline = input.rsvpDeadlineDate ? zonedTimeToUtc(input.rsvpDeadlineDate, "23:59", DEFAULT_TIMEZONE) : null;
  if (input.date && input.endDate && input.endDate < input.date) throw invalid("تاریخ پایان نباید قبل از شروع باشد.");

  await getDb().transaction(async (tx) => {
    if (input.celebrantMemberId) {
      await requireActiveMembers(tx, ev.groupId, [input.celebrantMemberId]);
      const [inSpace] = await tx
        .select({ spaceId: privateSpaceMembers.spaceId })
        .from(privateSpaceMembers)
        .innerJoin(privateSpaces, eq(privateSpaces.id, privateSpaceMembers.spaceId))
        .where(and(eq(privateSpaces.eventId, eventId), eq(privateSpaceMembers.memberId, input.celebrantMemberId)))
        .limit(1);
      if (inSpace) throw invalid("این شخص عضو یک فضای خصوصی همین رویداد است و نمی‌تواند صاحب تولد باشد.");
    }
    const after = {
      title: input.title,
      type: input.type,
      description: input.description,
      startDate: input.date,
      endDate: input.endDate,
      startsAt,
      timezone: DEFAULT_TIMEZONE,
      locationName: input.locationName,
      locationNote: input.locationNote,
      mapUrl,
      rsvpDeadline,
      celebrantMemberId: input.celebrantMemberId,
      finalAdults: input.finalAdults,
      finalChildren: input.finalChildren,
    };
    await tx.update(events).set(after).where(eq(events.id, eventId));
    await tx.delete(eventBudgets).where(eq(eventBudgets.eventId, eventId));
    const budgetRows = BUDGET_CATEGORIES.filter((c) => input.budgets[c] !== null).map((c) => ({
      eventId,
      category: c,
      amount: input.budgets[c]!,
    }));
    if (budgetRows.length) await tx.insert(eventBudgets).values(budgetRows);
    await writeAudit(tx, { groupId: ev.groupId, entityType: "event", entityId: eventId, action: "details", actor, before: ev, after });
  });
}

export const rsvpInput = z.object({
  status: z.enum(["going", "maybe", "declined"]),
  adultCompanions: z.coerce.number().int().min(0).max(50),
  childCompanions: z.coerce.number().int().min(0).max(50),
  note: z.string().trim().max(300).optional(),
});

/**
 * RSVP for yourself (or, for an admin, on behalf of a guest without an account). Attendance and
 * companions only drive catering numbers; they never create or change any debt.
 */
export async function setRsvp(actor: Actor, eventId: string, raw: z.input<typeof rsvpInput>, forMemberId?: string): Promise<void> {
  assertId(eventId, "رویداد");
  const input = rsvpInput.parse(raw);
  await getDb().transaction(async (tx) => {
    const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!ev) throw notFound("رویداد");
    const me = await requireMember(tx, ev.groupId, actor);
    let memberId = me.id;
    if (forMemberId && forMemberId !== me.id) {
      assertId(forMemberId, "عضو");
      const target = (await requireActiveMembers(tx, ev.groupId, [forMemberId])).get(forMemberId)!;
      if (target.userId || !isAdmin(me)) throw forbidden("پاسخ حضور هر کس را خودش ثبت می‌کند (مدیر فقط برای مهمان بدون حساب).");
      memberId = forMemberId;
    }
    if (ev.status === "closed" || ev.status === "cancelled") throw invalid("این رویداد دیگر پاسخ حضور نمی‌پذیرد.");
    const values = {
      eventId,
      memberId,
      status: input.status,
      adultCompanions: input.status === "declined" ? 0 : input.adultCompanions,
      childCompanions: input.status === "declined" ? 0 : input.childCompanions,
      note: input.note || null,
      respondedAt: new Date(),
    };
    await tx
      .insert(eventParticipants)
      .values(values)
      .onConflictDoUpdate({ target: [eventParticipants.eventId, eventParticipants.memberId], set: values });
    await writeAudit(tx, { groupId: ev.groupId, entityType: "event", entityId: eventId, action: "rsvp", actor, after: values });
  });
}

/** Adds members to the guest list as "invited" (no response yet). Never creates debt. */
export async function inviteToEvent(actor: Actor, eventId: string, memberIds: string[]): Promise<void> {
  const { ev } = await requireEventManager(eventId, actor);
  memberIds.forEach((m) => assertId(m, "عضو"));
  await getDb().transaction(async (tx) => {
    await requireActiveMembers(tx, ev.groupId, memberIds);
    if (memberIds.length) {
      await tx
        .insert(eventParticipants)
        .values(memberIds.map((memberId) => ({ eventId, memberId, status: "invited" as const })))
        .onConflictDoNothing();
    }
    await notifyMembers(tx, ev.groupId, memberIds, actor, "event_invited", { eventId, title: ev.title });
  });
}

export const cakeInput = z.object({
  adultGrams: z.coerce.number().int().min(0).max(5000),
  childGrams: z.coerce.number().int().min(0).max(5000),
  marginPercent: z.coerce.number().min(0).max(200),
  roundStepGrams: z.coerce.number().int().min(50).max(5000),
  orderGrams: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 200_000), "مقدار سفارش معتبر نیست."),
});

export async function updateCakeSettings(actor: Actor, eventId: string, raw: z.input<typeof cakeInput>): Promise<void> {
  const input = cakeInput.parse(raw);
  const { ev } = await requireEventManager(eventId, actor);
  const after = {
    cakeAdultGrams: input.adultGrams,
    cakeChildGrams: input.childGrams,
    cakeMarginBp: Math.round(input.marginPercent * 100),
    cakeRoundStepGrams: input.roundStepGrams,
    cakeOrderGrams: input.orderGrams,
  };
  await getDb().transaction(async (tx) => {
    await tx.update(events).set(after).where(eq(events.id, eventId));
    await writeAudit(tx, { groupId: ev.groupId, entityType: "event", entityId: eventId, action: "cake", actor, before: ev, after });
  });
}

// ───────────────────────── checklist ─────────────────────────

export const taskInput = z.object({
  title: z.string().trim().min(1, "عنوان کار را وارد کنید.").max(160),
  assigneeMemberId: id.nullable(),
  dueDate: isoDate.nullable(),
  spaceId: id.nullable(),
});

export async function createTask(actor: Actor, eventId: string, raw: z.input<typeof taskInput>): Promise<{ taskId: string }> {
  assertId(eventId, "رویداد");
  const input = taskInput.parse(raw);
  return getDb().transaction(async (tx) => {
    const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!ev) throw notFound("رویداد");
    await requireMember(tx, ev.groupId, actor);
    if (input.spaceId) {
      const access = await requireSpaceMember(tx, input.spaceId, actor);
      if (access.space.eventId !== eventId) throw notFound("صفحه");
    }
    if (input.assigneeMemberId) {
      await requireActiveMembers(tx, ev.groupId, [input.assigneeMemberId]);
      if (input.spaceId) await requireSpaceMembers(tx, input.spaceId, [input.assigneeMemberId]);
    }
    const [task] = await tx
      .insert(eventTasks)
      .values({ eventId, spaceId: input.spaceId, title: input.title, assigneeMemberId: input.assigneeMemberId, dueDate: input.dueDate, createdBy: actor.userId })
      .returning();
    await writeAudit(tx, { groupId: ev.groupId, entityType: "task", entityId: task.id, action: "create", actor, after: task, spaceId: input.spaceId });
    if (input.assigneeMemberId) {
      await notifyMembers(tx, ev.groupId, [input.assigneeMemberId], actor, "task_assigned", { eventId, taskId: task.id, title: task.title }, { spaceId: input.spaceId });
    }
    return { taskId: task.id };
  });
}

async function requireTaskAccess(actor: Actor, taskId: string) {
  assertId(taskId, "کار");
  const db = getDb();
  const [row] = await db
    .select({ task: eventTasks, groupId: events.groupId })
    .from(eventTasks)
    .innerJoin(events, eq(events.id, eventTasks.eventId))
    .where(eq(eventTasks.id, taskId))
    .limit(1);
  if (!row) throw notFound("کار");
  const me = await requireMember(db, row.groupId, actor);
  if (row.task.spaceId) await requireSpaceMember(db, row.task.spaceId, actor);
  return { ...row, me };
}

export async function setTaskDone(actor: Actor, taskId: string, done: boolean): Promise<void> {
  const { task, groupId } = await requireTaskAccess(actor, taskId);
  await getDb().transaction(async (tx) => {
    await tx.update(eventTasks).set({ done, doneAt: done ? new Date() : null }).where(eq(eventTasks.id, taskId));
    await writeAudit(tx, { groupId, entityType: "task", entityId: taskId, action: done ? "done" : "undone", actor, before: task, spaceId: task.spaceId });
  });
}

export async function deleteTask(actor: Actor, taskId: string): Promise<void> {
  const { task, groupId, me } = await requireTaskAccess(actor, taskId);
  if (task.createdBy !== actor.userId && !isAdmin(me)) throw forbidden("فقط سازنده کار یا مدیر گروه می‌تواند آن را حذف کند.");
  await getDb().transaction(async (tx) => {
    await tx.delete(eventTasks).where(eq(eventTasks.id, taskId));
    await writeAudit(tx, { groupId, entityType: "task", entityId: taskId, action: "delete", actor, before: task, spaceId: task.spaceId });
  });
}

/** Member names of a group (for selects). */
export async function memberNames(groupId: string): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ id: groupMembers.id, name: groupMembers.displayName })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  return new Map(rows.map((r) => [r.id, r.name]));
}
