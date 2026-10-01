import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMembers, users } from "@/db/schema";
import type { Actor } from "@/server/access";
import { addGuestMember, createGroup } from "@/server/groups";

export async function makeUser(name: string): Promise<Actor & { email: string }> {
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`;
  const [u] = await getDb().insert(users).values({ email, name }).returning();
  return { userId: u.id, email };
}

export async function memberIdOf(groupId: string, actor: Actor): Promise<string> {
  const rows = await getDb().select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const m = rows.find((r) => r.userId === actor.userId && !r.leftAt);
  if (!m) throw new Error("not a member");
  return m.id;
}

/** A group owned by `owner` with the given guest members. Returns member ids by name. */
export async function makeGroup(owner: Actor, guests: string[]) {
  const { groupId } = await createGroup(owner, "گروه آزمایشی");
  const ids: Record<string, string> = { owner: await memberIdOf(groupId, owner) };
  for (const g of guests) ids[g] = (await addGuestMember(owner, groupId, g)).memberId;
  return { groupId, ids };
}

export const key = () => `k_${randomUUID().replace(/-/g, "")}`;

export const today = "2026-10-01";

export function equalExpense(
  groupId: string,
  total: bigint,
  payer: string,
  sharers: string[],
  extra: Record<string, unknown> = {},
) {
  return {
    groupId,
    eventId: null,
    title: "هزینه",
    category: "food",
    date: today,
    totalAmount: total.toString(),
    splitType: "equal",
    payers: [{ memberId: payer, amount: total.toString() }],
    shares: sharers.map((memberId) => ({ memberId, value: "0" })),
    ...extra,
  };
}
