import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db";
import { events, groupMembers, pollOptions, polls, pollVotes, privateSpaceMembers } from "@/db/schema";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/domain/calendar";
import { AGGREGATE_MIN_RESPONDENTS, isPollOpen, tallyPoll, validateBallot } from "@/domain/polls";
import { assertId, isAdmin, requireMember, requireSpaceMember, type Actor } from "./access";
import { notifyMembers, writeAudit } from "./audit";
import { forbidden, invalid, notFound } from "./errors";
import { id, isoDate } from "./inputs";

export const pollInput = z
  .object({
    groupId: id,
    eventId: id.nullable(),
    spaceId: id.nullable(),
    kind: z.enum(["datetime", "place", "activity", "budget", "gift", "custom"]),
    question: z.string().trim().min(1, "سؤال را وارد کنید.").max(200),
    multi: z.boolean(),
    resultsMode: z.enum(["public", "aggregate"]),
    deadlineDate: isoDate.nullable(),
    deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    options: z
      .array(
        z.object({
          label: z.string().trim().max(120),
          date: isoDate.nullable().optional(),
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
        }),
      )
      .max(20),
  })
  .refine((p) => p.kind !== "gift" || p.spaceId, "نظرسنجی انتخاب هدیه فقط داخل فضای خصوصی ساخته می‌شود.");
export type PollInput = z.input<typeof pollInput>;

/** Who may see and answer a poll: group members with an account, or only the space members. */
async function eligibleMemberIds(db: DbOrTx, poll: { groupId: string; spaceId: string | null }): Promise<string[]> {
  if (poll.spaceId) {
    const rows = await db
      .select({ id: groupMembers.id })
      .from(privateSpaceMembers)
      .innerJoin(groupMembers, eq(groupMembers.id, privateSpaceMembers.memberId))
      .where(and(eq(privateSpaceMembers.spaceId, poll.spaceId), isNotNull(groupMembers.userId), isNull(groupMembers.leftAt)));
    return rows.map((r) => r.id);
  }
  const rows = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, poll.groupId), isNotNull(groupMembers.userId), isNull(groupMembers.leftAt)));
  return rows.map((r) => r.id);
}

async function requirePollAccess(db: DbOrTx, actor: Actor, pollId: string) {
  assertId(pollId, "نظرسنجی");
  const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
  if (!poll) throw notFound("نظرسنجی");
  const me = await requireMember(db, poll.groupId, actor);
  if (poll.spaceId) await requireSpaceMember(db, poll.spaceId, actor);
  return { poll, me };
}

export async function createPoll(actor: Actor, raw: PollInput): Promise<{ pollId: string }> {
  const input = pollInput.parse(raw);
  const options = input.options
    .map((o, i) => {
      const startsAt = input.kind === "datetime" && o.date ? zonedTimeToUtc(o.date, o.time || "20:00", DEFAULT_TIMEZONE) : null;
      return { label: o.label.trim(), startsAt, sort: i, date: o.date };
    })
    .filter((o) => o.label || o.startsAt);
  if (options.length < 2) throw invalid("حداقل دو گزینه لازم است.");
  if (input.kind === "datetime" && options.some((o) => !o.startsAt)) throw invalid("برای هر گزینه زمانی تاریخ را انتخاب کنید.");
  const deadline = input.deadlineDate ? zonedTimeToUtc(input.deadlineDate, input.deadlineTime || "23:59", DEFAULT_TIMEZONE) : null;
  if (deadline && deadline.getTime() <= Date.now()) throw invalid("مهلت پاسخ باید در آینده باشد.");

  return getDb().transaction(async (tx) => {
    await requireMember(tx, input.groupId, actor);
    if (input.spaceId) {
      const { space } = await requireSpaceMember(tx, input.spaceId, actor);
      if (space.groupId !== input.groupId) throw notFound("صفحه");
    }
    if (input.eventId) {
      const [ev] = await tx.select({ groupId: events.groupId }).from(events).where(eq(events.id, input.eventId));
      if (!ev || ev.groupId !== input.groupId) throw notFound("رویداد");
    }
    const [poll] = await tx
      .insert(polls)
      .values({
        groupId: input.groupId,
        eventId: input.eventId,
        spaceId: input.spaceId,
        kind: input.kind,
        question: input.question,
        multi: input.multi,
        resultsMode: input.resultsMode,
        deadline,
        createdBy: actor.userId,
      })
      .returning();
    await tx.insert(pollOptions).values(options.map((o) => ({ pollId: poll.id, label: o.label || "", startsAt: o.startsAt, sort: o.sort })));
    await writeAudit(tx, { groupId: input.groupId, entityType: "poll", entityId: poll.id, action: "create", actor, after: poll, spaceId: input.spaceId });
    const voters = await eligibleMemberIds(tx, poll);
    await notifyMembers(tx, input.groupId, voters, actor, "poll_created", { pollId: poll.id, question: poll.question }, { spaceId: input.spaceId });
    return { pollId: poll.id };
  });
}

/**
 * Replaces the member's whole ballot. Resending the same request leaves exactly the same rows, so
 * a retry can never add an extra vote. Votes are refused when closed or past the deadline.
 */
export async function vote(actor: Actor, pollId: string, optionIds: string[]): Promise<void> {
  optionIds.forEach((o) => assertId(o, "گزینه"));
  await getDb().transaction(async (tx) => {
    const { poll, me } = await requirePollAccess(tx, actor, pollId);
    const [locked] = await tx.select().from(polls).where(eq(polls.id, pollId)).for("update");
    if (!isPollOpen(locked)) throw invalid("مهلت این نظرسنجی تمام شده یا بسته شده است.");
    const eligible = await eligibleMemberIds(tx, poll);
    if (!eligible.includes(me.id)) throw forbidden("شما در این نظرسنجی حق رأی ندارید.");
    const options = await tx.select({ id: pollOptions.id }).from(pollOptions).where(eq(pollOptions.pollId, pollId));
    const chosen = validateBallot(options.map((o) => o.id), optionIds, poll.multi);
    await tx.delete(pollVotes).where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.memberId, me.id)));
    await tx.insert(pollVotes).values(chosen.map((optionId) => ({ pollId, optionId, memberId: me.id })));
  });
}

async function requirePollManager(actor: Actor, pollId: string) {
  const db = getDb();
  const { poll, me } = await requirePollAccess(db, actor, pollId);
  if (poll.createdBy !== actor.userId && !isAdmin(me)) throw forbidden("فقط سازنده نظرسنجی یا مدیر گروه می‌تواند این کار را انجام دهد.");
  return poll;
}

/** Step 1 of 2: stop accepting answers. */
export async function closePoll(actor: Actor, pollId: string): Promise<void> {
  const poll = await requirePollManager(actor, pollId);
  if (poll.status === "closed") return;
  await getDb().transaction(async (tx) => {
    await tx.update(polls).set({ status: "closed", closedAt: new Date() }).where(eq(polls.id, pollId));
    await writeAudit(tx, { groupId: poll.groupId, entityType: "poll", entityId: pollId, action: "close", actor, spaceId: poll.spaceId });
  });
}

/**
 * Step 2 of 2: announce the final decision (any option — the organiser may weigh more than
 * counts). Optionally applies a date/time or place choice to the event. A decision never books,
 * buys or commits anyone's money.
 */
export async function decidePoll(actor: Actor, pollId: string, optionId: string, note: string | undefined, applyToEvent: boolean): Promise<void> {
  assertId(optionId, "گزینه");
  const poll = await requirePollManager(actor, pollId);
  if (poll.status !== "closed") throw invalid("ابتدا نظرسنجی را ببندید، سپس تصمیم نهایی را اعلام کنید.");
  await getDb().transaction(async (tx) => {
    const [opt] = await tx.select().from(pollOptions).where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, pollId)));
    if (!opt) throw notFound("گزینه");
    await tx
      .update(polls)
      .set({ decidedOptionId: opt.id, decisionNote: note?.trim().slice(0, 300) || null, decidedAt: new Date() })
      .where(eq(polls.id, pollId));
    if (applyToEvent && poll.eventId && !poll.spaceId) {
      if (poll.kind === "datetime" && opt.startsAt) {
        const local = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(opt.startsAt);
        await tx.update(events).set({ startsAt: opt.startsAt, startDate: local }).where(eq(events.id, poll.eventId));
      } else if (poll.kind === "place") {
        await tx.update(events).set({ locationName: opt.label }).where(eq(events.id, poll.eventId));
      }
    }
    await writeAudit(tx, { groupId: poll.groupId, entityType: "poll", entityId: pollId, action: "decide", actor, after: { optionId: opt.id, label: opt.label, applyToEvent }, spaceId: poll.spaceId });
    const voters = await eligibleMemberIds(tx, poll);
    await notifyMembers(tx, poll.groupId, voters, actor, "poll_decided", { pollId, question: poll.question, label: opt.label }, { spaceId: poll.spaceId });
  });
}

export async function getPollView(actor: Actor, pollId: string) {
  const db = getDb();
  const { poll, me } = await requirePollAccess(db, actor, pollId);
  const [options, votes, eligible] = await Promise.all([
    db.select().from(pollOptions).where(eq(pollOptions.pollId, pollId)).orderBy(asc(pollOptions.sort)),
    db.select({ memberId: pollVotes.memberId, optionId: pollVotes.optionId }).from(pollVotes).where(eq(pollVotes.pollId, pollId)),
    eligibleMemberIds(db, poll),
  ]);
  const tally = tallyPoll(options.map((o) => o.id), votes, eligible);
  const aggregate = poll.resultsMode === "aggregate";
  const showCounts = !aggregate || tally.respondents >= AGGREGATE_MIN_RESPONDENTS;
  const names = new Map(
    (await db.select({ id: groupMembers.id, name: groupMembers.displayName }).from(groupMembers).where(eq(groupMembers.groupId, poll.groupId))).map(
      (m) => [m.id, m.name],
    ),
  );
  return {
    poll,
    open: isPollOpen(poll),
    canManage: poll.createdBy === actor.userId || isAdmin(me),
    eligible: eligible.includes(me.id),
    options,
    myVotes: votes.filter((v) => v.memberId === me.id).map((v) => v.optionId),
    respondents: tally.respondents,
    eligibleCount: tally.eligible,
    // Who has not answered yet (participation, not answers) is shown in public mode only.
    nonRespondents: aggregate ? [] : tally.nonRespondentIds.map((m) => names.get(m) ?? "—"),
    results: showCounts
      ? tally.options.map((o) => ({
          ...o,
          // Individual choices are exposed only in public mode — never in aggregate mode, not even to admins.
          voters: aggregate ? [] : votes.filter((v) => v.optionId === o.optionId).map((v) => names.get(v.memberId) ?? "—"),
        }))
      : null,
    leaders: showCounts ? tally.leaders : [],
    aggregateHidden: !showCounts,
  };
}

export async function listPolls(actor: Actor, scope: { groupId: string; eventId?: string; spaceId?: string }) {
  const db = getDb();
  await requireMember(db, scope.groupId, actor);
  if (scope.spaceId) await requireSpaceMember(db, scope.spaceId, actor);
  const where = scope.spaceId
    ? eq(polls.spaceId, scope.spaceId)
    : scope.eventId
      ? and(eq(polls.eventId, scope.eventId), isNull(polls.spaceId))
      : and(eq(polls.groupId, scope.groupId), isNull(polls.spaceId));
  return db.select().from(polls).where(where).orderBy(desc(polls.createdAt));
}
