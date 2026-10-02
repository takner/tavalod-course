import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { eventBudgets, eventParticipants, eventTasks, pollVotes, polls } from "@/db/schema";
import { estimateCake } from "@/domain/cake";
import { isPollOpen } from "@/domain/polls";
import type { Actor } from "./access";
import { getEventView } from "./queries";
import { mySpacesForEvent } from "./spaces";

/** Public expense category → budget line. Private (surprise) money never appears here. */
const BUDGET_LINE: Record<string, "food" | "cake" | "venue" | "gift" | "other"> = {
  food: "food",
  cake: "cake",
  venue: "venue",
  accommodation: "venue",
  gift: "gift",
};

export interface NextAction {
  kind: "rsvp" | "poll" | "task" | "space";
  label: string;
  href: string;
}

export async function getEventPlan(actor: Actor, groupId: string, eventId: string) {
  const base = await getEventView(actor, groupId, eventId);
  const db = getDb();
  const [participants, budgets, tasks, eventPolls, spaces] = await Promise.all([
    db.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId)),
    db.select().from(eventBudgets).where(eq(eventBudgets.eventId, eventId)),
    db
      .select()
      .from(eventTasks)
      .where(and(eq(eventTasks.eventId, eventId), isNull(eventTasks.spaceId)))
      .orderBy(asc(eventTasks.done), asc(eventTasks.dueDate), asc(eventTasks.createdAt)),
    db
      .select()
      .from(polls)
      .where(and(eq(polls.eventId, eventId), isNull(polls.spaceId))),
    mySpacesForEvent(actor, eventId),
  ]);
  const myVotes = eventPolls.length
    ? await db
        .select({ pollId: pollVotes.pollId })
        .from(pollVotes)
        .where(and(inArray(pollVotes.pollId, eventPolls.map((p) => p.id)), eq(pollVotes.memberId, base.me.id)))
    : [];
  const votedPolls = new Set(myVotes.map((v) => v.pollId));
  const ev = base.event;

  // ── attendance & headcount (companions are statistical guests only) ──
  const going = participants.filter((p) => p.status === "going");
  const derivedAdults = going.length + going.reduce((a, p) => a + p.adultCompanions, 0);
  const derivedChildren = going.reduce((a, p) => a + p.childCompanions, 0);
  const headcount = {
    adults: ev.finalAdults ?? derivedAdults,
    children: ev.finalChildren ?? derivedChildren,
    derivedAdults,
    derivedChildren,
    overridden: ev.finalAdults !== null || ev.finalChildren !== null,
    going: going.length,
    maybe: participants.filter((p) => p.status === "maybe").length,
    declined: participants.filter((p) => p.status === "declined").length,
    noAnswer: participants.filter((p) => p.status === "invited").length,
  };
  const cake = estimateCake({
    adults: headcount.adults,
    children: headcount.children,
    adultGrams: ev.cakeAdultGrams,
    childGrams: ev.cakeChildGrams,
    marginBp: ev.cakeMarginBp,
    roundStepGrams: ev.cakeRoundStepGrams,
  });

  // ── budget vs actual (public expenses of this event; refunds subtract) ──
  const actual = new Map<string, bigint>();
  for (const e of base.expenses) {
    if (e.deletedAt) continue;
    const line = BUDGET_LINE[e.category] ?? "other";
    actual.set(line, (actual.get(line) ?? 0n) + (e.kind === "refund" ? -e.totalAmount : e.totalAmount));
  }
  const budgetBy = new Map(budgets.map((b) => [b.category, b.amount]));
  const lines = (["food", "cake", "venue", "other", "gift"] as const)
    .map((k) => ({ category: k, budget: budgetBy.get(k) ?? null, actual: actual.get(k) ?? 0n }))
    .filter((l) => l.category !== "gift" || l.actual !== 0n);

  // ── what is still undecided / who must answer / my next steps ──
  const openPolls = eventPolls.filter((p) => isPollOpen(p));
  const undecided: string[] = [];
  if (!ev.startsAt && !ev.startDate) undecided.push("زمان رویداد");
  else if (!ev.startsAt) undecided.push("ساعت رویداد");
  if (!ev.locationName) undecided.push("مکان");
  for (const p of openPolls) undecided.push(`نظرسنجی: ${p.question}`);

  const me = participants.find((p) => p.memberId === base.me.id);
  const href = `/groups/${groupId}/events/${eventId}`;
  const next: NextAction[] = [];
  if (!me || me.status === "invited") next.push({ kind: "rsvp", label: "حضورتان را اعلام کنید", href: `${href}#rsvp` });
  for (const p of openPolls) {
    if (!votedPolls.has(p.id)) next.push({ kind: "poll", label: `رأی بدهید: ${p.question}`, href: `/groups/${groupId}/polls/${p.id}` });
  }
  for (const t of tasks) {
    if (!t.done && t.assigneeMemberId === base.me.id) next.push({ kind: "task", label: `کار شما: ${t.title}`, href: `${href}#tasks` });
  }
  for (const s of spaces) next.push({ kind: "space", label: `فضای خصوصی: ${s.title}`, href: `/groups/${groupId}/spaces/${s.id}` });

  return {
    ...base,
    participants,
    headcount,
    cake,
    budgetLines: lines,
    tasks,
    polls: eventPolls,
    votedPolls,
    spaces,
    undecided,
    next,
    waitingFor: participants.filter((p) => p.status === "invited").map((p) => p.memberId),
  };
}
