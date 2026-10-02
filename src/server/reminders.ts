import { and, eq, gt, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { eventParticipants, events, giftPledges, gifts, groupMembers, notifications, polls, pollVotes, privateSpaceMembers } from "@/db/schema";
import type { Actor } from "./access";

const HOUR = 3_600_000;

/**
 * In-app reminders, generated lazily when the user opens the app (no background job needed).
 * Each reminder has a dedupe key (unique per user), so it is created at most once. Gift reminders
 * are only for members of that gift's private space, and are tagged with the space.
 */
export async function generateReminders(actor: Actor): Promise<void> {
  const db = getDb();
  const now = new Date();
  const memberships = await db
    .select({ id: groupMembers.id, groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, actor.userId), isNull(groupMembers.leftAt)));
  if (!memberships.length) return;
  const memberIds = memberships.map((m) => m.id);
  const groupIds = memberships.map((m) => m.groupId);
  const memberByGroup = new Map(memberships.map((m) => [m.groupId, m.id]));
  const rows: (typeof notifications.$inferInsert)[] = [];

  // Polls closing within 24h that I have not answered (public, or in a space I belong to).
  const spaceIdsRows = await db.select({ spaceId: privateSpaceMembers.spaceId }).from(privateSpaceMembers).where(inArray(privateSpaceMembers.memberId, memberIds));
  const mySpaces = spaceIdsRows.map((r) => r.spaceId);
  const soonPolls = await db
    .select()
    .from(polls)
    .where(
      and(
        inArray(polls.groupId, groupIds),
        eq(polls.status, "open"),
        isNotNull(polls.deadline),
        gt(polls.deadline, now),
        lt(polls.deadline, new Date(now.getTime() + 24 * HOUR)),
        mySpaces.length ? or(isNull(polls.spaceId), inArray(polls.spaceId, mySpaces)) : isNull(polls.spaceId),
      ),
    );
  if (soonPolls.length) {
    const voted = await db
      .select({ pollId: pollVotes.pollId })
      .from(pollVotes)
      .where(and(inArray(pollVotes.pollId, soonPolls.map((p) => p.id)), inArray(pollVotes.memberId, memberIds)));
    const votedSet = new Set(voted.map((v) => v.pollId));
    for (const p of soonPolls) {
      if (votedSet.has(p.id)) continue;
      rows.push({ userId: actor.userId, groupId: p.groupId, spaceId: p.spaceId, type: "reminder_poll", payload: { pollId: p.id, question: p.question }, dedupeKey: `poll:${p.id}` });
    }
  }

  // RSVP deadline within 48h and I have not answered.
  const rsvps = await db
    .select({ eventId: events.id, title: events.title, groupId: events.groupId })
    .from(eventParticipants)
    .innerJoin(events, eq(events.id, eventParticipants.eventId))
    .where(
      and(
        inArray(eventParticipants.memberId, memberIds),
        eq(eventParticipants.status, "invited"),
        isNotNull(events.rsvpDeadline),
        gt(events.rsvpDeadline, now),
        lt(events.rsvpDeadline, new Date(now.getTime() + 48 * HOUR)),
      ),
    );
  for (const r of rsvps) {
    rows.push({ userId: actor.userId, groupId: r.groupId, type: "reminder_rsvp", payload: { eventId: r.eventId, title: r.title }, dedupeKey: `rsvp:${r.eventId}` });
  }

  // Gift contribution deadline within 48h, I was invited and have not answered. Space-scoped.
  if (mySpaces.length) {
    const pending = await db
      .select({ giftId: gifts.id, title: gifts.title, groupId: gifts.groupId, spaceId: gifts.spaceId })
      .from(giftPledges)
      .innerJoin(gifts, eq(gifts.id, giftPledges.giftId))
      .where(
        and(
          inArray(giftPledges.memberId, memberIds),
          eq(giftPledges.status, "invited"),
          inArray(gifts.spaceId, mySpaces),
          inArray(gifts.status, ["proposed", "collecting"]),
          isNotNull(gifts.contributionDeadline),
          gt(gifts.contributionDeadline, now),
          lt(gifts.contributionDeadline, new Date(now.getTime() + 48 * HOUR)),
        ),
      );
    for (const g of pending) {
      if (!memberByGroup.has(g.groupId)) continue;
      rows.push({ userId: actor.userId, groupId: g.groupId, spaceId: g.spaceId, type: "reminder_pledge", payload: { giftId: g.giftId, spaceId: g.spaceId, title: g.title }, dedupeKey: `pledge:${g.giftId}` });
    }
  }

  if (rows.length) await db.insert(notifications).values(rows).onConflictDoNothing();
}
