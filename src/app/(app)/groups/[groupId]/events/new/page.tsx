import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getGroupMembersForForm } from "@/server/queries";
import { ACTIVITY_TEMPLATES } from "@/domain/activities";
import { EventForm } from "./EventForm";

export const metadata: Metadata = { title: "رویداد جدید" };

export default async function NewEventPage(props: PageProps<"/groups/[groupId]/events/new">) {
  const { groupId } = await props.params;
  const { template: templateId } = await props.searchParams;
  const user = await requireUser(`/groups/${groupId}/events/new`);
  const data = await orNotFound(getGroupMembersForForm({ userId: user.id }, groupId));
  const template = ACTIVITY_TEMPLATES.find((t) => t.id === templateId) ?? null;
  return (
    <>
      <PageHeader title="رویداد جدید" back={{ href: `/groups/${groupId}`, label: data.group.name }} subtitle={template ? `از الگوی «${template.title}» — همه چیز قابل ویرایش است` : undefined} />
      <EventForm
        groupId={groupId}
        members={data.members.map((m) => ({ id: m.id, name: m.name, isMe: m.isMe }))}
        template={template ? { id: template.id, title: template.title, type: template.eventType, checklist: template.checklist } : null}
      />
    </>
  );
}
