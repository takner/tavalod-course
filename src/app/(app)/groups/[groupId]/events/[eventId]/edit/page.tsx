import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { eventBudgets } from "@/db/schema";
import { Notice, PageHeader } from "@/components/ui";
import { instantToLocalParts } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getEventView } from "@/server/queries";
import { EventDetailsForm } from "./EventDetailsForm";

export const metadata: Metadata = { title: "ویرایش رویداد" };

export default async function EditEventPage(props: PageProps<"/groups/[groupId]/events/[eventId]/edit">) {
  const { groupId, eventId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/events/${eventId}/edit`);
  const view = await orNotFound(getEventView({ userId: user.id }, groupId, eventId));
  const back = { href: `/groups/${groupId}/events/${eventId}`, label: view.event.title };
  if (!view.me.canManage) {
    return (
      <>
        <PageHeader title="ویرایش رویداد" back={back} />
        <Notice tone="error">فقط برگزارکننده یا مدیر گروه می‌تواند جزئیات را تغییر دهد.</Notice>
      </>
    );
  }
  const ev = view.event;
  const budgets = await getDb().select().from(eventBudgets).where(eq(eventBudgets.eventId, eventId));
  const local = instantToLocalParts(ev.startsAt, ev.timezone);
  const deadline = instantToLocalParts(ev.rsvpDeadline, ev.timezone);
  return (
    <>
      <PageHeader title="ویرایش رویداد" back={back} />
      <EventDetailsForm
        groupId={groupId}
        eventId={eventId}
        members={view.members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))}
        defaults={{
          title: ev.title,
          type: ev.type,
          description: ev.description,
          date: local.dateIso ?? ev.startDate,
          time: local.hhmm,
          endDate: ev.endDate,
          locationName: ev.locationName,
          locationNote: ev.locationNote,
          mapUrl: ev.mapUrl,
          rsvpDeadline: deadline.dateIso,
          celebrant: ev.celebrantMemberId,
          finalAdults: ev.finalAdults,
          finalChildren: ev.finalChildren,
          budgets: Object.fromEntries(budgets.map((b) => [b.category, b.amount.toString()])),
        }}
      />
    </>
  );
}
