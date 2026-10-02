import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decideSettlementAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { OnlineOnly } from "@/components/OnlineOnly";
import { Balance, Chip, EmptyState, Money, Notice, PageHeader } from "@/components/ui";
import { formatToman } from "@/domain/money";
import { formatJalaliDateTime, GIFT_STATUS_LABELS, POLL_KIND_LABELS } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getSpaceView } from "@/server/spaces";
import { TaskList } from "../../events/[eventId]/TaskList";
import { AddMembersForm, MessageForm } from "./SpaceForms";

export const metadata: Metadata = { title: "فضای خصوصی" };

export default async function SpacePage(props: PageProps<"/groups/[groupId]/spaces/[spaceId]">) {
  const { groupId, spaceId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/spaces/${spaceId}`);
  const view = await orNotFound(getSpaceView({ userId: user.id }, spaceId));
  if (view.space.groupId !== groupId) notFound();
  const name = (id: string) => view.members.find((m) => m.id === id)?.name ?? view.candidates.find((m) => m.id === id)?.name ?? "—";
  const myBalance = view.balances.get(view.me.memberId) ?? 0n;
  const base = `/groups/${groupId}/spaces/${spaceId}`;

  return (
    <>
      <PageHeader title={`🤫 ${view.space.title}`} back={{ href: `/groups/${groupId}/events/${view.space.eventId}`, label: view.event.title }} />
      <div className="space-y-4">
        <Notice>
          فقط این {new Intl.NumberFormat("fa-IR").format(view.members.length)} نفر این صفحه را می‌بینند. صاحب تولد به آن، به هزینه‌ها و پیام‌های آن و به اعلان‌هایش دسترسی ندارد و
          این حساب‌ها در مانده عمومی گروه هم نمی‌آیند.
        </Notice>

        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">هدیه‌های گروهی</h2>
            <Link href={`${base}/gifts/new`} className="btn-ghost min-h-8 px-2 text-xs">
              + هدیه
            </Link>
          </div>
          {view.gifts.length === 0 ? (
            <EmptyState title="هنوز هدیه‌ای تعریف نشده">از ویش‌لیست صاحب تولد انتخاب کنید یا یک هدیه مستقل تعریف کنید.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {view.gifts.map((g) => (
                <li key={g.id}>
                  <Link href={`${base}/gifts/${g.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
                    <span>
                      <span className="block font-medium">{g.title}</span>
                      <span className="text-xs text-muted">
                        مسئول خرید: {name(g.buyerMemberId)}
                        {g.budget !== null && ` · بودجه ${formatToman(g.budget)}`}
                      </span>
                    </span>
                    <Chip tone={g.status === "cancelled" ? "negative" : g.status === "purchased" || g.status === "delivered" ? "positive" : "primary"}>{GIFT_STATUS_LABELS[g.status]}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="mb-2 font-bold">حساب خصوصی این فضا</h2>
          <p className="mb-2 text-sm">
            مانده شما: <Balance value={myBalance} />
          </p>
          {view.suggestions.length > 0 && (
            <ul className="mb-2 space-y-1 text-sm">
              {view.suggestions.map((t) => (
                <li key={`${t.fromMemberId}-${t.toMemberId}`} className="flex justify-between">
                  <span>
                    {name(t.fromMemberId)} ← به {name(t.toMemberId)}
                  </span>
                  <Money value={t.amount} />
                </li>
              ))}
            </ul>
          )}
          {view.pending.length > 0 && (
            <div className="space-y-2 border-t border-border pt-2">
              <p className="text-xs font-bold text-muted">در انتظار تأیید دریافت</p>
              {view.pending.map((p) => (
                <div key={p.id} className="text-sm">
                  <p>
                    {name(p.fromMemberId)} ← {name(p.toMemberId)}: {formatToman(p.amount)}
                  </p>
                  {p.canDecide && (
                    <OnlineOnly>
                      <div className="mt-1 flex gap-2">
                        <ActionButton action={decideSettlementAction.bind(null, groupId, p.id, "confirm")} className="btn-primary min-h-9 px-3 text-xs">
                          دریافت کردم
                        </ActionButton>
                        <ActionButton action={decideSettlementAction.bind(null, groupId, p.id, "reject")} className="btn-danger min-h-9 px-3 text-xs" confirmText="این پرداخت رد شود؟">
                          دریافت نکردم
                        </ActionButton>
                      </div>
                    </OnlineOnly>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-2 font-bold">کارهای مخفی</h2>
          <TaskList
            groupId={groupId}
            eventId={view.space.eventId}
            spaceId={spaceId}
            tasks={view.tasks.map((t) => ({ id: t.id, title: t.title, done: t.done, dueDate: t.dueDate, assignee: t.assigneeMemberId ? name(t.assigneeMemberId) : null }))}
            members={view.members.map((m) => ({ id: m.id, name: m.name }))}
          />
        </section>

        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">نظرسنجی‌های خصوصی</h2>
            <Link href={`/groups/${groupId}/polls/new?spaceId=${spaceId}&kind=gift`} className="btn-ghost min-h-8 px-2 text-xs">
              + نظرسنجی
            </Link>
          </div>
          {view.polls.length === 0 ? (
            <p className="text-sm text-muted">مثلاً برای انتخاب بین چند هدیه.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {view.polls.map((p) => (
                <li key={p.id}>
                  <Link href={`/groups/${groupId}/polls/${p.id}`} className="text-primary">
                    {p.question} <span className="text-xs text-muted">({POLL_KIND_LABELS[p.kind]})</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="mb-2 font-bold">گفت‌وگوی هماهنگی</h2>
          <ul className="mb-3 max-h-80 space-y-2 overflow-y-auto">
            {view.messages.length === 0 && <li className="text-sm text-muted">هنوز پیامی نیست.</li>}
            {view.messages.map((m) => (
              <li key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.memberId === view.me.memberId ? "mr-8 bg-primary-soft" : "ml-8 bg-surface-2"}`}>
                <p className="text-xs font-bold">{name(m.memberId)}</p>
                <p className="leading-7 whitespace-pre-wrap">{m.body}</p>
                <p className="text-[10px] text-muted">{formatJalaliDateTime(m.createdAt)}</p>
              </li>
            ))}
          </ul>
          <MessageForm groupId={groupId} spaceId={spaceId} />
        </section>

        <section className="card">
          <h2 className="mb-2 font-bold">اعضا</h2>
          <p className="text-sm">{view.members.map((m) => m.name).join("، ")}</p>
          {view.candidates.length > 0 && <AddMembersForm groupId={groupId} spaceId={spaceId} candidates={view.candidates.map((m) => ({ id: m.id, name: m.name }))} />}
        </section>

        {view.history.length > 0 && (
          <details className="card">
            <summary className="cursor-pointer font-bold">سابقه تغییرات خصوصی</summary>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {view.history.map(({ log, actorName }) => (
                <li key={log.id}>
                  {formatJalaliDateTime(log.at)} — {actorName}: {log.entityType} / {log.action}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}
