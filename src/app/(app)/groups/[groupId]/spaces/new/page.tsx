import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getEventView } from "@/server/queries";
import { NewSpaceForm } from "./NewSpaceForm";

export const metadata: Metadata = { title: "فضای خصوصی" };

export default async function NewSpacePage(props: PageProps<"/groups/[groupId]/spaces/new">) {
  const { groupId } = await props.params;
  const { eventId } = await props.searchParams;
  if (typeof eventId !== "string") notFound();
  const user = await requireUser(`/groups/${groupId}/events/${eventId}`);
  const view = await orNotFound(getEventView({ userId: user.id }, groupId, eventId));
  const celebrant = view.event.celebrantMemberId;
  if (celebrant === view.me.id) notFound();
  const candidates = view.members.filter((m) => m.active && m.id !== celebrant && !m.isMe);
  return (
    <>
      <PageHeader title="فضای خصوصی سورپرایز" back={{ href: `/groups/${groupId}/events/${eventId}`, label: view.event.title }} />
      <NewSpaceForm
        groupId={groupId}
        eventId={eventId}
        defaultTitle={`سورپرایز ${view.event.title}`}
        candidates={candidates.map((m) => ({ id: m.id, name: m.name }))}
        celebrantName={celebrant ? (view.members.find((m) => m.id === celebrant)?.name ?? null) : null}
      />
    </>
  );
}
