import type { Metadata } from "next";
import { decideSettlementAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { PendingOps } from "@/components/PendingOps";
import { SettlementForm } from "@/components/SettlementForm";
import { Money, PageHeader } from "@/components/ui";
import { AMOUNT_STRING_RE } from "@/domain/money";
import { formatJalaliDateTime, METHOD_LABELS } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getGroupView } from "@/server/queries";

export const metadata: Metadata = { title: "تسویه" };

export default async function SettlePage(props: PageProps<"/groups/[groupId]/settle">) {
  const { groupId } = await props.params;
  const sp = await props.searchParams;
  const user = await requireUser(`/groups/${groupId}/settle`);
  const view = await orNotFound(getGroupView({ userId: user.id }, groupId));
  const name = (id: string) => view.members.find((m) => m.id === id)?.name ?? "—";
  const active = view.members.filter((m) => m.active);
  const valid = (id: unknown) => (typeof id === "string" && active.some((m) => m.id === id) ? id : undefined);
  const prefill = {
    from: valid(sp.from),
    to: valid(sp.to),
    amount: typeof sp.amount === "string" && AMOUNT_STRING_RE.test(sp.amount) && !sp.amount.startsWith("-") ? sp.amount : undefined,
  };

  return (
    <>
      <PageHeader title="ثبت تسویه" back={{ href: `/groups/${groupId}?tab=balances`, label: view.group.name }} />
      <div className="space-y-4">
        <PendingOps groupId={groupId} />
        <section className="card">
          <SettlementForm
            groupId={groupId}
            members={active.map((m) => ({ id: m.id, name: m.name, isMe: m.isMe }))}
            events={view.events.map((e) => ({ id: e.id, title: e.title }))}
            isAdmin={view.me.isAdmin}
            prefill={prefill}
          />
          <p className="mt-3 text-xs leading-6 text-muted">
            این اپ پول جابه‌جا نمی‌کند؛ انتقال را با کارت یا نقدی انجام دهید و اینجا ثبت کنید. تسویه‌ای که پرداخت‌کننده ثبت کند،
            تا تأیید دریافت‌کننده در مانده‌ها حساب نمی‌شود.
          </p>
        </section>

        {view.suggestions.length > 0 && (
          <section className="card">
            <h2 className="mb-2 font-bold">پیشنهاد تسویه با انتقال کمتر</h2>
            <ul className="space-y-1 text-sm">
              {view.suggestions.map((t) => (
                <li key={`${t.fromMemberId}-${t.toMemberId}`} className="flex justify-between">
                  <span>
                    {name(t.fromMemberId)} ← به {name(t.toMemberId)}
                  </span>
                  <a className="text-primary" href={`/groups/${groupId}/settle?from=${t.fromMemberId}&to=${t.toMemberId}&amount=${t.amount}`}>
                    <Money value={t.amount} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {view.pending.length > 0 && (
          <section className="card">
            <h2 className="mb-2 font-bold">در انتظار تأیید</h2>
            <ul className="space-y-3 text-sm">
              {view.pending.map((p) => (
                <li key={p.id}>
                  <div className="flex justify-between">
                    <span>
                      {name(p.fromMemberId)} ← {name(p.toMemberId)} ({METHOD_LABELS[p.method]})
                    </span>
                    <Money value={p.amount} />
                  </div>
                  <p className="text-xs text-muted">{formatJalaliDateTime(p.createdAt)}</p>
                  {p.canDecide && (
                    <div className="mt-2 flex gap-2">
                      <ActionButton action={decideSettlementAction.bind(null, groupId, p.id, "confirm")} className="btn-primary min-h-9">
                        دریافت کردم
                      </ActionButton>
                      <ActionButton
                        action={decideSettlementAction.bind(null, groupId, p.id, "reject")}
                        className="btn-danger min-h-9"
                        confirmText="این تسویه رد شود؟"
                      >
                        دریافت نکردم
                      </ActionButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
