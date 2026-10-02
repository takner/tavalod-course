import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { upcomingBirthdays } from "@/server/birthdays";
import { getGroupMembersForForm } from "@/server/queries";
import { BirthdayForm } from "./BirthdayForm";

export const metadata: Metadata = { title: "ساخت تولد" };

export default async function NewBirthdayPage(props: PageProps<"/groups/[groupId]/birthdays/new">) {
  const { groupId } = await props.params;
  const { member } = await props.searchParams;
  const user = await requireUser(`/groups/${groupId}/birthdays/new`);
  const actor = { userId: user.id };
  const data = await orNotFound(getGroupMembersForForm(actor, groupId));
  const upcoming = await upcomingBirthdays(actor, groupId, todayIso(), 366);
  const nextDates = Object.fromEntries(upcoming.map((u) => [u.memberId, u.next.iso]));
  return (
    <>
      <PageHeader title="ساخت تولد" back={{ href: `/groups/${groupId}`, label: data.group.name }} subtitle="رویداد، دعوت، فضای سورپرایز و چک‌لیست در یک قدم" />
      <BirthdayForm
        groupId={groupId}
        members={data.members.map((m) => ({ id: m.id, name: m.name, isMe: m.isMe }))}
        nextDates={nextDates}
        defaultMember={typeof member === "string" ? member : null}
      />
    </>
  );
}
