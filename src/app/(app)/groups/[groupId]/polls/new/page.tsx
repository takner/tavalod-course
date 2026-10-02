import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getGroupMembersForForm } from "@/server/queries";
import { getSpaceView } from "@/server/spaces";
import { PollForm } from "./PollForm";

export const metadata: Metadata = { title: "نظرسنجی جدید" };

export default async function NewPollPage(props: PageProps<"/groups/[groupId]/polls/new">) {
  const { groupId } = await props.params;
  const sp = await props.searchParams;
  const user = await requireUser(`/groups/${groupId}/polls/new`);
  const actor = { userId: user.id };
  const data = await orNotFound(getGroupMembersForForm(actor, groupId));
  const spaceId = typeof sp.spaceId === "string" ? sp.spaceId : null;
  const space = spaceId ? await orNotFound(getSpaceView(actor, spaceId)) : null;
  const eventId = typeof sp.eventId === "string" && data.events.some((e) => e.id === sp.eventId) ? sp.eventId : null;
  const kind = typeof sp.kind === "string" ? sp.kind : spaceId ? "gift" : "datetime";
  const back = space ? { href: `/groups/${groupId}/spaces/${spaceId}`, label: space.space.title } : eventId ? { href: `/groups/${groupId}/events/${eventId}`, label: "رویداد" } : { href: `/groups/${groupId}`, label: data.group.name };
  return (
    <>
      <PageHeader title="نظرسنجی جدید" back={back} subtitle={space ? "خصوصی — فقط اعضای فضای سورپرایز" : undefined} />
      <PollForm groupId={groupId} eventId={eventId} spaceId={spaceId} defaultKind={kind} />
    </>
  );
}
