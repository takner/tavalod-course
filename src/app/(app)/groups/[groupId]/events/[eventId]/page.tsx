import type { Metadata } from "next";
import Link from "next/link";
import { changeEventStatusAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { PendingOps } from "@/components/PendingOps";
import { Balance, Chip, EmptyState, Money, Notice, PageHeader } from "@/components/ui";
import { CATEGORY_LABELS, EVENT_STATUS_LABELS, EVENT_TYPE_LABELS, formatJalaliDate } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getEventView } from "@/server/queries";
import { ParticipantsForm } from "./ParticipantsForm";

export const metadata: Metadata = { title: "رویداد" };

export default async function EventPage(props: PageProps<"/groups/[groupId]/events/[eventId]">) {
  const { groupId, eventId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/events/${eventId}`);
  const view = await orNotFound(getEventView({ userId: user.id }, groupId, eventId));
  const { event: ev } = view;
  const name = (id: string) => view.members.find((m) => m.id === id)?.name ?? "—";
  const writable = ev.status === "active" || ev.status === "planned";
  const nonZero = [...view.balances.entries()].filter(([, v]) => v !== 0n);

  return (
    <>
      <PageHeader
        title={ev.title}
        back={{ href: `/groups/${groupId}`, label: "گروه" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone="primary">{EVENT_TYPE_LABELS[ev.type]}</Chip>
            <Chip tone={ev.status === "closed" ? "positive" : ev.status === "cancelled" ? "negative" : "neutral"}>
              {EVENT_STATUS_LABELS[ev.status]}
            </Chip>
            {ev.startDate && (
              <span>
                {formatJalaliDate(ev.startDate)}
                {ev.endDate && ` تا ${formatJalaliDate(ev.endDate)}`}
              </span>
            )}
          </span>
        }
      />
      <div className="space-y-4">
        <section className="card flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">جمع هزینه‌های رویداد</p>
            <Money value={view.spent} className="text-lg font-bold" />
          </div>
          {writable && (
            <Link href={`/groups/${groupId}/expenses/new?eventId=${eventId}`} className="btn-primary">
              + هزینه
            </Link>
          )}
        </section>
        {ev.status === "cancelled" && (
          <Notice tone="warning">این رویداد لغو شده است. هزینه‌های ثبت‌شده باقی می‌مانند؛ برای بازپرداخت از «برگشت خرید» هر هزینه استفاده کنید.</Notice>
        )}
        <PendingOps groupId={groupId} />

        <section className="card">
          <h2 className="mb-2 font-bold">مانده‌ها در این رویداد</h2>
          {nonZero.length === 0 ? (
            <p className="text-sm text-muted">حساب‌های این رویداد تسویه است.</p>
          ) : (
            <ul className="divide-y divide-border">
              {nonZero.map(([memberId, v]) => (
                <li key={memberId}>
                  <Link
                    href={`/groups/${groupId}/balance/${memberId}?eventId=${eventId}`}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span>{name(memberId)}</span>
                    <Balance value={v} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-bold">هزینه‌ها</h2>
          {view.expenses.length === 0 ? (
            <EmptyState title="هنوز هزینه‌ای ثبت نشده" />
          ) : (
            <ul className="space-y-2">
              {view.expenses.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/groups/${groupId}/expenses/${e.id}`}
                    className={`card flex items-center justify-between gap-2 py-3 hover:border-primary/40 ${e.deletedAt ? "opacity-50" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {e.title}
                        {e.deletedAt && " (حذف‌شده)"}
                      </span>
                      <span className="text-xs text-muted">
                        {CATEGORY_LABELS[e.category]} · {formatJalaliDate(e.date)}
                      </span>
                    </span>
                    <span className={`text-sm font-bold tabular ${e.kind === "refund" ? "text-positive" : ""}`}>
                      {e.kind === "refund" ? "−" : ""}
                      <Money value={e.totalAmount} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ParticipantsForm
          groupId={groupId}
          eventId={eventId}
          members={view.members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))}
          selected={view.participantIds}
        />

        {view.me.canManage && (
          <section className="card space-y-2">
            <h2 className="font-bold">وضعیت رویداد</h2>
            <div className="flex flex-wrap gap-2">
              {writable && (
                <ActionButton
                  action={changeEventStatusAction.bind(null, groupId, eventId, "close")}
                  className="btn-primary min-h-10"
                  confirmText="رویداد بسته شود؟ بعد از بستن، هزینه‌های آن قابل تغییر نیستند."
                >
                  بستن رویداد
                </ActionButton>
              )}
              {(ev.status === "closed" || ev.status === "cancelled") && (
                <ActionButton action={changeEventStatusAction.bind(null, groupId, eventId, "reopen")} className="btn-secondary min-h-10">
                  باز کردن دوباره
                </ActionButton>
              )}
              {writable && (
                <ActionButton
                  action={changeEventStatusAction.bind(null, groupId, eventId, "cancel")}
                  className="btn-danger min-h-10"
                  confirmText="رویداد لغو شود؟ هزینه‌های ثبت‌شده حذف نمی‌شوند."
                >
                  لغو رویداد
                </ActionButton>
              )}
            </div>
            {writable && !view.closable && (
              <p className="text-xs text-muted">بستن فقط وقتی ممکن است که همه مانده‌های این رویداد صفر و تسویه‌ای در انتظار تأیید نباشد.</p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
