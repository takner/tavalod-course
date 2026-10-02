import type { Metadata } from "next";
import Link from "next/link";
import { changeEventStatusAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { PendingOps } from "@/components/PendingOps";
import { Balance, Chip, EmptyState, Money, Notice, PageHeader } from "@/components/ui";
import { formatToman } from "@/domain/money";
import {
  BUDGET_LABELS,
  CATEGORY_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  formatEventInstant,
  formatJalaliDate,
  POLL_KIND_LABELS,
  RSVP_LABELS,
  toPersianDigits,
} from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getEventPlan } from "@/server/event-plan";
import { RsvpForm } from "./RsvpForm";
import { TaskList } from "./TaskList";

export const metadata: Metadata = { title: "رویداد" };

const fa = (n: number) => toPersianDigits(n);

export default async function EventPage(props: PageProps<"/groups/[groupId]/events/[eventId]">) {
  const { groupId, eventId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/events/${eventId}`);
  const plan = await orNotFound(getEventPlan({ userId: user.id }, groupId, eventId));
  const { event: ev } = plan;
  const base = `/groups/${groupId}/events/${eventId}`;
  const name = (id: string) => plan.members.find((m) => m.id === id)?.name ?? "—";
  const writable = ev.status === "active" || ev.status === "planned";
  const nonZero = [...plan.balances.entries()].filter(([, v]) => v !== 0n);
  const myRsvp = plan.participants.find((p) => p.memberId === plan.me.id);
  const guests = plan.members.filter((m) => m.active && m.isGuest);

  return (
    <>
      <PageHeader
        title={ev.title}
        back={{ href: `/groups/${groupId}`, label: "گروه" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone="primary">{EVENT_TYPE_LABELS[ev.type]}</Chip>
            <Chip tone={ev.status === "closed" ? "positive" : ev.status === "cancelled" ? "negative" : "neutral"}>{EVENT_STATUS_LABELS[ev.status]}</Chip>
            {ev.celebrantMemberId && <span>🎂 {name(ev.celebrantMemberId)}</span>}
          </span>
        }
        action={
          plan.me.canManage ? (
            <Link href={`${base}/edit`} className="btn-secondary min-h-9 px-3 text-xs">
              ویرایش جزئیات
            </Link>
          ) : null
        }
      />
      <div className="space-y-4">
        {ev.status === "cancelled" && <Notice tone="warning">این رویداد لغو شده است. هزینه‌های ثبت‌شده باقی می‌مانند؛ برای بازپرداخت از «برگشت خرید» استفاده کنید.</Notice>}

        {/* When & where */}
        <section className="card space-y-2 text-sm">
          <p>
            <span className="text-muted">زمان: </span>
            {ev.startsAt ? formatEventInstant(ev.startsAt, ev.timezone) : ev.startDate ? `${formatJalaliDate(ev.startDate)} (ساعت مشخص نشده)` : "هنوز مشخص نشده"}
          </p>
          <p>
            <span className="text-muted">مکان: </span>
            {ev.locationName ?? "هنوز مشخص نشده"}
            {ev.mapUrl && (
              <>
                {" · "}
                <a href={ev.mapUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">
                  نقشه
                </a>
              </>
            )}
          </p>
          {ev.locationNote && <p className="text-muted">دسترسی: {ev.locationNote}</p>}
          {ev.rsvpDeadline && <p className="text-muted">مهلت پاسخ حضور: {formatEventInstant(ev.rsvpDeadline, ev.timezone)}</p>}
          {ev.description && <p className="leading-7">{ev.description}</p>}
        </section>

        {/* Next steps for me */}
        <section className="card" data-testid="next-actions">
          <h2 className="mb-2 font-bold">کار بعدی شما</h2>
          {plan.next.length === 0 ? (
            <p className="text-sm text-muted">فعلاً کاری منتظر شما نیست. 👌</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {plan.next.map((n) => (
                <li key={n.href + n.label}>
                  <Link href={n.href} className="flex items-center justify-between gap-2 rounded-lg bg-primary-soft px-3 py-2 text-primary-strong">
                    {n.label} <span aria-hidden>‹</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {plan.undecided.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold text-muted">هنوز تصمیم‌گیری نشده:</p>
              <ul className="mt-1 list-inside list-disc text-xs leading-6 text-muted">
                {plan.undecided.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* RSVP */}
        <section id="rsvp" className="card scroll-mt-24 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">حضور</h2>
            <span className="text-xs text-muted">
              می‌آیند {fa(plan.headcount.going)} · شاید {fa(plan.headcount.maybe)} · نمی‌آیند {fa(plan.headcount.declined)} · بی‌پاسخ {fa(plan.headcount.noAnswer)}
            </span>
          </div>
          {writable && (
            <RsvpForm
              groupId={groupId}
              eventId={eventId}
              current={myRsvp ? { status: myRsvp.status, adults: myRsvp.adultCompanions, children: myRsvp.childCompanions } : null}
              guests={plan.me.isAdmin ? guests.map((g) => ({ id: g.id, name: g.name })) : []}
            />
          )}
          <ul className="divide-y divide-border text-sm">
            {plan.participants.map((p) => (
              <li key={p.memberId} className="flex items-center justify-between py-2">
                <span>
                  {name(p.memberId)}
                  {(p.adultCompanions > 0 || p.childCompanions > 0) && (
                    <span className="text-xs text-muted">
                      {" "}
                      + {fa(p.adultCompanions)} بزرگسال، {fa(p.childCompanions)} کودک همراه
                    </span>
                  )}
                </span>
                <Chip tone={p.status === "going" ? "positive" : p.status === "declined" ? "negative" : p.status === "maybe" ? "warning" : "neutral"}>{RSVP_LABELS[p.status]}</Chip>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-6 text-muted">
            مهمانان قطعی: {fa(plan.headcount.adults)} بزرگسال و {fa(plan.headcount.children)} کودک
            {plan.headcount.overridden ? " (تعیین‌شده توسط برگزارکننده)" : " (بر اساس پاسخ‌های «می‌آیم»)"}. همراهان فقط برای تدارکات شمرده می‌شوند و
            بدهی ایجاد نمی‌کنند.
          </p>
        </section>

        {/* Budget vs actual */}
        <section className="card">
          <h2 className="mb-2 font-bold">بودجه و هزینه واقعی</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1 text-right font-normal">بخش</th>
                <th className="py-1 text-right font-normal">بودجه تقریبی</th>
                <th className="py-1 text-right font-normal">هزینه ثبت‌شده</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plan.budgetLines.map((l) => (
                <tr key={l.category}>
                  <td className="py-1.5">{BUDGET_LABELS[l.category]}</td>
                  <td className="tabular">{l.budget !== null ? formatToman(l.budget, { unit: false }) : "—"}</td>
                  <td className={`tabular ${l.budget !== null && l.actual > l.budget ? "text-negative" : ""}`}>{formatToman(l.actual, { unit: false })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">ارقام به تومان. هزینه ثبت‌شده فقط هزینه‌های قطعی همین رویداد است؛ تعهدها و پیش‌پرداخت‌ها جدا نگه داشته می‌شوند.</p>
        </section>

        {/* Cake */}
        <Link href={`${base}/cake`} className="card flex items-center justify-between">
          <span>
            <span className="block font-bold">کیک 🎂</span>
            <span className="text-xs text-muted">
              برآورد برای {fa(plan.headcount.adults)} بزرگسال و {fa(plan.headcount.children)} کودک
            </span>
          </span>
          <span className="text-left">
            <span className="block font-bold tabular">{toPersianDigits((ev.cakeOrderGrams ?? plan.cake.suggestedGrams) / 1000)} کیلو</span>
            <span className="text-xs text-muted">{ev.cakeOrderGrams ? "سفارش نهایی" : "پیشنهاد"}</span>
          </span>
        </Link>

        {/* Checklist */}
        <section id="tasks" className="card scroll-mt-24">
          <h2 className="mb-2 font-bold">چک‌لیست تدارکات</h2>
          <TaskList
            groupId={groupId}
            eventId={eventId}
            spaceId={null}
            tasks={plan.tasks.map((t) => ({ id: t.id, title: t.title, done: t.done, dueDate: t.dueDate, assignee: t.assigneeMemberId ? name(t.assigneeMemberId) : null }))}
            members={plan.members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))}
          />
        </section>

        {/* Polls */}
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">نظرسنجی‌ها</h2>
            <Link href={`/groups/${groupId}/polls/new?eventId=${eventId}`} className="btn-ghost min-h-8 px-2 text-xs">
              + نظرسنجی
            </Link>
          </div>
          {plan.polls.length === 0 ? (
            <p className="text-sm text-muted">مثلاً برای انتخاب زمان، مکان یا بودجه یک نظرسنجی بسازید.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {plan.polls.map((p) => (
                <li key={p.id}>
                  <Link href={`/groups/${groupId}/polls/${p.id}`} className="flex items-center justify-between gap-2">
                    <span>
                      {p.question} <span className="text-xs text-muted">({POLL_KIND_LABELS[p.kind]})</span>
                    </span>
                    <Chip tone={p.decidedOptionId ? "positive" : p.status === "open" ? "primary" : "neutral"}>
                      {p.decidedOptionId ? "تصمیم گرفته شد" : p.status === "open" ? (plan.votedPolls.has(p.id) ? "رأی داده‌اید" : "باز") : "بسته"}
                    </Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Private space (only rendered for its members) */}
        {plan.spaces.map((s) => (
          <Link key={s.id} href={`/groups/${groupId}/spaces/${s.id}`} className="card flex items-center justify-between border border-primary/30 bg-primary-soft/40">
            <span>
              <span className="block font-bold">🤫 {s.title}</span>
              <span className="text-xs text-muted">هدیه گروهی و هماهنگی سورپرایز — فقط اعضای این فضا آن را می‌بینند</span>
            </span>
            <span aria-hidden>‹</span>
          </Link>
        ))}
        {writable && plan.spaces.length === 0 && ev.celebrantMemberId !== plan.me.id && (
          <Link href={`/groups/${groupId}/spaces/new?eventId=${eventId}`} className="btn-secondary w-full">
            ساخت فضای خصوصی سورپرایز (هدیه گروهی)
          </Link>
        )}

        {/* Money (phase 1) */}
        <section className="card flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">جمع هزینه‌های رویداد</p>
            <Money value={plan.spent} className="text-lg font-bold" />
          </div>
          {writable && (
            <Link href={`/groups/${groupId}/expenses/new?eventId=${eventId}`} className="btn-primary">
              + هزینه
            </Link>
          )}
        </section>
        <PendingOps groupId={groupId} />
        <section className="card">
          <h2 className="mb-2 font-bold">مانده‌ها در این رویداد</h2>
          {nonZero.length === 0 ? (
            <p className="text-sm text-muted">حساب‌های این رویداد تسویه است.</p>
          ) : (
            <ul className="divide-y divide-border">
              {nonZero.map(([memberId, v]) => (
                <li key={memberId}>
                  <Link href={`/groups/${groupId}/balance/${memberId}?eventId=${eventId}`} className="flex items-center justify-between py-2 text-sm">
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
          {plan.expenses.length === 0 ? (
            <EmptyState title="هنوز هزینه‌ای ثبت نشده" />
          ) : (
            <ul className="space-y-2">
              {plan.expenses.map((e) => (
                <li key={e.id}>
                  <Link href={`/groups/${groupId}/expenses/${e.id}`} className={`card flex items-center justify-between gap-2 py-3 ${e.deletedAt ? "opacity-50" : ""}`}>
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

        {plan.me.canManage && (
          <section className="card space-y-2">
            <h2 className="font-bold">وضعیت رویداد</h2>
            <div className="flex flex-wrap gap-2">
              {writable && (
                <ActionButton action={changeEventStatusAction.bind(null, groupId, eventId, "close")} className="btn-primary min-h-10" confirmText="رویداد بسته شود؟ بعد از بستن، هزینه‌های آن قابل تغییر نیستند.">
                  بستن رویداد
                </ActionButton>
              )}
              {(ev.status === "closed" || ev.status === "cancelled") && (
                <ActionButton action={changeEventStatusAction.bind(null, groupId, eventId, "reopen")} className="btn-secondary min-h-10">
                  باز کردن دوباره
                </ActionButton>
              )}
              {writable && (
                <ActionButton action={changeEventStatusAction.bind(null, groupId, eventId, "cancel")} className="btn-danger min-h-10" confirmText="رویداد لغو شود؟ هزینه‌های ثبت‌شده حذف نمی‌شوند.">
                  لغو رویداد
                </ActionButton>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
