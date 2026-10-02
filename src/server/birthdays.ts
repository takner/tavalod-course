import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { eventParticipants, events, eventTasks, groupMembers, privateSpaceMembers, privateSpaces, users } from "@/db/schema";
import { DEFAULT_TIMEZONE, nextBirthday, validateBirthday, zonedTimeToUtc, type BirthCalendar } from "@/domain/calendar";
import { requireActiveMembers, requireMember, type Actor } from "./access";
import { notifyMembers, writeAudit } from "./audit";
import { forbidden, invalid } from "./errors";
import { id, isoDate } from "./inputs";

export const birthdayInput = z
  .object({
    calendar: z.enum(["jalali", "gregorian"]),
    month: z.coerce.number().int(),
    day: z.coerce.number().int(),
    year: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : null)),
  })
  .nullable();

/** Saves (or clears) the user's yearly birthday in their own calendar. */
export async function updateMyBirthday(actor: Actor, raw: z.input<typeof birthdayInput>): Promise<void> {
  const input = birthdayInput.parse(raw);
  if (input) validateBirthday(input.calendar, input.month, input.day, input.year);
  await getDb()
    .update(users)
    .set(
      input
        ? { birthCalendar: input.calendar, birthMonth: input.month, birthDay: input.day, birthYear: input.year }
        : { birthCalendar: null, birthMonth: null, birthDay: null, birthYear: null },
    )
    .where(eq(users.id, actor.userId));
}

/** Members of a group whose birthday falls within `days` days (members choose to set it). */
export async function upcomingBirthdays(actor: Actor, groupId: string, todayIso: string, days = 60) {
  const db = getDb();
  await requireMember(db, groupId, actor);
  const rows = await db
    .select({
      memberId: groupMembers.id,
      name: groupMembers.displayName,
      cal: users.birthCalendar,
      month: users.birthMonth,
      day: users.birthDay,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt), isNotNull(users.birthCalendar)));
  return rows
    .map((r) => ({ memberId: r.memberId, name: r.name, next: nextBirthday(r.cal as BirthCalendar, r.month!, r.day!, todayIso) }))
    .filter((r) => r.next.daysUntil <= days)
    .sort((a, b) => a.next.daysUntil - b.next.daysUntil);
}

export const newBirthdayInput = z.object({
  groupId: id,
  celebrantMemberId: id,
  date: isoDate,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  title: z.string().trim().max(120).optional(),
  createSurprise: z.boolean(),
  addChecklist: z.boolean(),
});

const PUBLIC_TASKS = ["خرید کیک", "هماهنگی محل", "تهیه غذا"];
const SURPRISE_TASKS = ["انتخاب و خرید هدیه"];

/**
 * One-step birthday: the event (with celebrant), everyone invited (no debt), an optional surprise
 * space containing every member except the celebrant, and a starter checklist.
 */
export async function createBirthday(actor: Actor, raw: z.input<typeof newBirthdayInput>): Promise<{ eventId: string; spaceId: string | null }> {
  const input = newBirthdayInput.parse(raw);
  return getDb().transaction(async (tx) => {
    const me = await requireMember(tx, input.groupId, actor);
    if (me.id === input.celebrantMemberId && input.createSurprise) {
      throw forbidden("برای تولد خودتان نمی‌توانید فضای سورپرایز بسازید.");
    }
    const [celebrant] = [...(await requireActiveMembers(tx, input.groupId, [input.celebrantMemberId])).values()];
    const all = await tx
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, input.groupId), isNull(groupMembers.leftAt)));
    const title = input.title?.trim() || `تولد ${celebrant.displayName}`;
    const startsAt = input.time ? zonedTimeToUtc(input.date, input.time, DEFAULT_TIMEZONE) : null;
    const [ev] = await tx
      .insert(events)
      .values({
        groupId: input.groupId,
        title,
        type: "birthday",
        status: "active",
        startDate: input.date,
        startsAt,
        timezone: DEFAULT_TIMEZONE,
        celebrantMemberId: celebrant.id,
        createdBy: actor.userId,
      })
      .returning();
    await tx.insert(eventParticipants).values(
      all.map((m) => ({ eventId: ev.id, memberId: m.id, status: m.id === me.id ? ("going" as const) : ("invited" as const), respondedAt: m.id === me.id ? new Date() : null })),
    );
    if (input.addChecklist) {
      await tx.insert(eventTasks).values(PUBLIC_TASKS.map((t) => ({ eventId: ev.id, title: t, createdBy: actor.userId })));
    }
    let spaceId: string | null = null;
    if (input.createSurprise) {
      const memberIds = all.map((m) => m.id).filter((m) => m !== celebrant.id);
      if (memberIds.length === 0) throw invalid("برای فضای سورپرایز حداقل یک نفر غیر از صاحب تولد لازم است.");
      const [space] = await tx
        .insert(privateSpaces)
        .values({ groupId: input.groupId, eventId: ev.id, title: `سورپرایز ${title}`, createdBy: actor.userId })
        .returning();
      spaceId = space.id;
      await tx.insert(privateSpaceMembers).values(memberIds.map((memberId) => ({ spaceId: space.id, memberId })));
      if (input.addChecklist) {
        await tx.insert(eventTasks).values(SURPRISE_TASKS.map((t) => ({ eventId: ev.id, spaceId: space.id, title: t, createdBy: actor.userId })));
      }
      await writeAudit(tx, { groupId: input.groupId, entityType: "space", entityId: space.id, action: "create", actor, after: { ...space, members: memberIds }, spaceId: space.id });
      await notifyMembers(tx, input.groupId, memberIds, actor, "space_added", { spaceId: space.id, title: space.title, eventId: ev.id }, { spaceId: space.id });
    }
    await writeAudit(tx, { groupId: input.groupId, entityType: "event", entityId: ev.id, action: "create", actor, after: ev });
    await notifyMembers(tx, input.groupId, all.map((m) => m.id), actor, "event_invited", { eventId: ev.id, title });
    return { eventId: ev.id, spaceId };
  });
}
