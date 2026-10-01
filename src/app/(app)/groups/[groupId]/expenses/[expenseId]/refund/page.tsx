import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/ui";
import { formatToman } from "@/domain/money";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getExpenseView } from "@/server/queries";
import { RefundForm } from "./RefundForm";

export const metadata: Metadata = { title: "برگشت خرید" };

export default async function RefundPage(props: PageProps<"/groups/[groupId]/expenses/[expenseId]/refund">) {
  const { groupId, expenseId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/expenses/${expenseId}/refund`);
  const view = await orNotFound(getExpenseView({ userId: user.id }, groupId, expenseId));
  const back = { href: `/groups/${groupId}/expenses/${expenseId}`, label: view.expense.title };
  if (view.expense.kind !== "expense" || view.refundable <= 0n || !view.canEdit) {
    return (
      <>
        <PageHeader title="برگشت خرید" back={back} />
        <Notice tone="error">برای این هزینه برگشت قابل ثبت نیست.</Notice>
      </>
    );
  }
  const name = (id: string) => view.members.find((m) => m.id === id)?.name ?? "—";
  return (
    <>
      <PageHeader title="برگشت خرید / لغو" back={back} subtitle={`حداکثر قابل برگشت: ${formatToman(view.refundable)}`} />
      <RefundForm
        groupId={groupId}
        expenseId={expenseId}
        refundable={view.refundable.toString()}
        payers={view.payers.map((p) => ({ id: p.memberId, name: name(p.memberId) }))}
      />
    </>
  );
}
