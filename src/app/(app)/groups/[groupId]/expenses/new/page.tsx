import type { Metadata } from "next";
import { ExpenseForm } from "@/components/ExpenseForm";
import { PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getGroupMembersForForm } from "@/server/queries";

export const metadata: Metadata = { title: "هزینه جدید" };

export default async function NewExpensePage(props: PageProps<"/groups/[groupId]/expenses/new">) {
  const { groupId } = await props.params;
  const { eventId } = await props.searchParams;
  const user = await requireUser(`/groups/${groupId}/expenses/new`);
  const data = await orNotFound(getGroupMembersForForm({ userId: user.id }, groupId));
  const openEvents = data.events.filter((e) => e.status === "active" || e.status === "planned");
  const defaultEventId = typeof eventId === "string" && openEvents.some((e) => e.id === eventId) ? eventId : null;
  const returnTo = defaultEventId ? `/groups/${groupId}/events/${defaultEventId}` : `/groups/${groupId}`;
  return (
    <>
      <PageHeader title="هزینه جدید" back={{ href: returnTo, label: "بازگشت" }} />
      <ExpenseForm
        groupId={groupId}
        members={data.members.map((m) => ({ id: m.id, name: m.name, isMe: m.isMe }))}
        events={openEvents}
        defaultEventId={defaultEventId}
        returnTo={returnTo}
      />
    </>
  );
}
