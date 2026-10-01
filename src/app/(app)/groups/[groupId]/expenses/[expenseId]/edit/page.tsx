import type { Metadata } from "next";
import { ExpenseForm } from "@/components/ExpenseForm";
import { Notice, PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getExpenseView, getGroupMembersForForm } from "@/server/queries";

export const metadata: Metadata = { title: "ویرایش هزینه" };

export default async function EditExpensePage(props: PageProps<"/groups/[groupId]/expenses/[expenseId]/edit">) {
  const { groupId, expenseId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/expenses/${expenseId}/edit`);
  const actor = { userId: user.id };
  const [view, data] = await orNotFound(Promise.all([getExpenseView(actor, groupId, expenseId), getGroupMembersForForm(actor, groupId)]));
  const back = { href: `/groups/${groupId}/expenses/${expenseId}`, label: "هزینه" };
  if (!view.canEdit || view.expense.kind === "refund") {
    return (
      <>
        <PageHeader title="ویرایش هزینه" back={back} />
        <Notice tone="error">اجازه ویرایش این هزینه را ندارید.</Notice>
      </>
    );
  }
  const e = view.expense;
  // Members referenced by this expense stay selectable even if they left the group later.
  const members = data.members.map((m) => ({ id: m.id, name: m.name, isMe: m.isMe }));
  const openEvents = data.events.filter((ev) => ev.status === "active" || ev.status === "planned" || ev.id === e.eventId);
  return (
    <>
      <PageHeader title="ویرایش هزینه" back={back} />
      <ExpenseForm
        groupId={groupId}
        members={members}
        events={openEvents}
        defaultEventId={e.eventId}
        returnTo={back.href}
        initial={{
          expenseId: e.id,
          version: e.version,
          title: e.title,
          category: e.category,
          date: e.date,
          eventId: e.eventId,
          totalAmount: e.totalAmount.toString(),
          splitType: e.splitType,
          note: e.note,
          payers: view.payers.map((p) => ({ memberId: p.memberId, amount: p.amount.toString() })),
          shares: view.shares.map((s) => ({ memberId: s.memberId, inputValue: s.inputValue.toString() })),
        }}
      />
    </>
  );
}
