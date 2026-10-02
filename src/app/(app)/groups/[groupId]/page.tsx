import type { Metadata } from "next";
import Link from "next/link";
import { decideSettlementAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { PendingOps } from "@/components/PendingOps";
import { CakeIcon, CalendarIcon, GiftIcon, PlusIcon, PollIcon, ReceiptIcon, ScaleIcon, SparkIcon, UsersIcon } from "@/components/icons";
import { upcomingBirthdays } from "@/server/birthdays";
import { Shortcut } from "@/components/Shortcut";
import { Balance, balanceHint, Chip, EmptyState, Money, PageHeader } from "@/components/ui";
import { formatToman } from "@/domain/money";
import { EVENT_STATUS_LABELS, EVENT_TYPE_LABELS, formatJalaliDate, formatJalaliDateTime, METHOD_LABELS, todayIso } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getActivity, getGroupView } from "@/server/queries";
import { describeAudit } from "./describe";

export const metadata: Metadata = { title: "گروه" };

const fa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

const TABS = [
  { key: "events", label: "رویدادها" },
  { key: "balances", label: "مانده‌ها" },
  { key: "activity", label: "فعالیت" },
] as const;

export default async function GroupPage(props: PageProps<"/groups/[groupId]">) {
  const { groupId } = await props.params;
  const { tab: rawTab } = await props.searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? (rawTab as (typeof TABS)[number]["key"]) : "events";
  const user = await requireUser(`/groups/${groupId}`);
  const actor = { userId: user.id };
  const view = await orNotFound(getGroupView(actor, groupId));
  const upcoming = await upcomingBirthdays(actor, groupId, todayIso(), 45);
  const base = `/groups/${groupId}`;
  const name = (id: string) => view.members.find((m) => m.id === id)?.name ?? "—";
  const myBalance = view.balances.get(view.me.id) ?? 0n;
  const mySuggestions = view.suggestions.filter((t) => t.fromMemberId === view.me.id || t.toMemberId === view.me.id);
  const needsMe = view.pending.filter((p) => p.canDecide);

  return (
    <>
      <PageHeader title={view.group.name} back={{ href: "/groups", label: "خانه" }} />

      <Link
        href={`${base}/balance/${view.me.id}`}
        className="relative mb-4 block overflow-hidden rounded-2xl bg-gradient-to-l from-[#ef4056] to-[#ff7a59] p-5 text-white"
      >
        <span className="absolute -top-8 -left-8 size-32 rounded-full bg-white/15" aria-hidden />
        <p className="text-sm text-white/85">مانده من در این گروه</p>
        <p className="mt-1 text-2xl font-black tabular">{formatToman(myBalance, { signed: true })}</p>
        <p className="mt-1 text-xs text-white/85">{balanceHint(myBalance)} · برای دیدن قلم‌به‌قلم بزنید</p>
      </Link>

      <section aria-label="دسترسی سریع" className="card mb-4 px-2 py-4">
        <div className="grid grid-cols-4 justify-items-center gap-y-4">
          <Shortcut href={`${base}/expenses/new`} label="هزینه جدید" color="bg-[#ef4056]" icon={<ReceiptIcon size={26} />} />
          <Shortcut
            href={`${base}/settle`}
            label="تسویه"
            color="bg-[#00897b]"
            icon={<ScaleIcon size={26} />}
            badge={needsMe.length > 0 ? `${fa(needsMe.length)} تأیید` : undefined}
          />
          <Shortcut href={`${base}/birthdays/new`} label="تولد" color="bg-[#d81b60]" icon={<CakeIcon size={26} />} />
          <Shortcut href={`${base}/events/new`} label="رویداد" color="bg-[#f57c00]" icon={<CalendarIcon size={26} />} />
          <Shortcut href={`${base}/polls/new`} label="نظرسنجی" color="bg-[#5c6bc0]" icon={<PollIcon size={26} />} />
          <Shortcut href={`${base}/wishlists`} label="ویش‌لیست‌ها" color="bg-[#8d6e63]" icon={<GiftIcon size={26} />} />
          <Shortcut href={`${base}/ideas`} label="ایده برنامه" color="bg-[#43a047]" icon={<SparkIcon size={26} />} />
          <Shortcut
            href={`${base}/members`}
            label={`اعضا (${fa(view.members.filter((m) => m.active).length)})`}
            color="bg-[#3a3a3a]"
            icon={<UsersIcon size={26} />}
          />
        </div>
      </section>

      {upcoming.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 text-sm font-bold">تولدهای پیش رو 🎂</h2>
          <ul className="space-y-1.5 text-sm">
            {upcoming.map((b) => (
              <li key={b.memberId} className="flex items-center justify-between gap-2">
                <span>
                  {b.name}
                  <span className="text-xs text-muted">
                    {" "}
                    · {formatJalaliDate(b.next.iso, false)} ({b.next.daysUntil === 0 ? "امروز" : `${fa(b.next.daysUntil)} روز دیگر`})
                  </span>
                </span>
                {b.memberId !== view.me.id && (
                  <Link href={`${base}/birthdays/new?member=${b.memberId}`} className="btn-ghost min-h-8 px-2 text-xs">
                    برنامه‌ریزی
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-4 space-y-3">
        <PendingOps groupId={groupId} />
        {needsMe.length > 0 && (
          <section className="card border-primary/40" data-testid="needs-confirmation">
            <h2 className="mb-2 font-bold">در انتظار تأیید شما</h2>
            <ul className="space-y-3">
              {needsMe.map((p) => (
                <li key={p.id} className="text-sm">
                  <p>
                    {name(p.fromMemberId)} اعلام کرده {formatToman(p.amount)} به {name(p.toMemberId)} پرداخت کرده است (
                    {METHOD_LABELS[p.method]}).
                  </p>
                  {p.note && <p className="text-xs text-muted">توضیح: {p.note}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActionButton action={decideSettlementAction.bind(null, groupId, p.id, "confirm")} className="btn-primary min-h-9">
                      دریافت کردم
                    </ActionButton>
                    <ActionButton
                      action={decideSettlementAction.bind(null, groupId, p.id, "reject")}
                      className="btn-danger min-h-9"
                      confirmText="این تسویه رد شود؟ مانده‌ها تغییر نمی‌کنند."
                    >
                      دریافت نکردم
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {mySuggestions.length > 0 && (
          <section className="card">
            <h2 className="mb-2 text-sm font-bold">پیشنهاد تسویه شما</h2>
            <ul className="space-y-1 text-sm">
              {mySuggestions.map((t) => (
                <li key={`${t.fromMemberId}-${t.toMemberId}`} className="flex items-center justify-between gap-2">
                  <span>
                    {t.fromMemberId === view.me.id ? `شما به ${name(t.toMemberId)}` : `${name(t.fromMemberId)} به شما`}
                  </span>
                  <Money value={t.amount} className="font-bold" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <nav className="mb-4 grid grid-cols-3 border-b border-border" aria-label="بخش‌های گروه">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/groups/${groupId}?tab=${t.key}`}
            className={`-mb-px border-b-2 py-2.5 text-center text-sm ${tab === t.key ? "border-primary font-bold text-primary" : "border-transparent text-muted"}`}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "events" && (
        <div className="space-y-3">
          <Link href={`/groups/${groupId}/events/new`} className="btn-secondary w-full">
            + رویداد جدید (سفر، تولد، دورهمی…)
          </Link>
          {view.events.length === 0 ? (
            <EmptyState title="هنوز رویدادی ندارید">
              هزینه‌ها را می‌توانید بدون رویداد هم ثبت کنید؛ رویداد کمک می‌کند حساب هر سفر یا دورهمی جدا دیده شود.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {view.events.map((ev) => (
                <li key={ev.id}>
                  <Link href={`/groups/${groupId}/events/${ev.id}`} className="card block hover:border-primary/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{ev.title}</span>
                      <Chip tone={ev.status === "closed" ? "positive" : ev.status === "cancelled" ? "negative" : "primary"}>
                        {EVENT_STATUS_LABELS[ev.status]}
                      </Chip>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted">
                      <span>
                        {EVENT_TYPE_LABELS[ev.type]}
                        {ev.startDate ? ` · ${formatJalaliDate(ev.startDate)}` : ""}
                      </span>
                      <span>
                        هزینه: <Money value={ev.spent} />
                        {!ev.settled && " · تسویه‌نشده"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {view.generalExpenseCount > 0 && (
            <p className="text-center text-xs text-muted">
              {new Intl.NumberFormat("fa-IR").format(view.generalExpenseCount)} هزینه بدون رویداد در حساب عمومی گروه ثبت شده است.
            </p>
          )}
        </div>
      )}

      {tab === "balances" && (
        <div className="space-y-4">
          <section className="card">
            <h2 className="mb-3 font-bold">مانده هر نفر</h2>
            <ul className="divide-y divide-border">
              {view.members
                .filter((m) => m.active || (view.balances.get(m.id) ?? 0n) !== 0n)
                .map((m) => {
                  const b = view.balances.get(m.id) ?? 0n;
                  return (
                    <li key={m.id}>
                      <Link href={`/groups/${groupId}/balance/${m.id}`} className="flex items-center justify-between py-2.5">
                        <span className="text-sm">
                          {m.name}
                          {m.isMe && " (من)"}
                          {m.isGuest && <span className="text-xs text-muted"> · مهمان</span>}
                        </span>
                        <Balance value={b} className="text-sm" />
                      </Link>
                    </li>
                  );
                })}
            </ul>
            <p className="mt-2 text-xs text-muted">مثبت یعنی طلبکار، منفی یعنی بدهکار. فقط تسویه‌های تأییدشده حساب می‌شوند.</p>
          </section>
          <section className="card">
            <h2 className="mb-1 font-bold">پیشنهاد تسویه با انتقال کمتر</h2>
            <p className="mb-3 text-xs text-muted">با این انتقال‌ها همه حساب‌ها صفر می‌شود.</p>
            {view.suggestions.length === 0 ? (
              <p className="text-sm text-muted">همه حساب‌ها تسویه است.</p>
            ) : (
              <ul className="space-y-2">
                {view.suggestions.map((t) => (
                  <li key={`${t.fromMemberId}-${t.toMemberId}`} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {name(t.fromMemberId)} ← به {name(t.toMemberId)}
                    </span>
                    <Link
                      href={`/groups/${groupId}/settle?from=${t.fromMemberId}&to=${t.toMemberId}&amount=${t.amount}`}
                      className="btn-ghost min-h-9 px-2"
                    >
                      <Money value={t.amount} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {view.pending.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-bold">تسویه‌های در انتظار تأیید</h2>
              <ul className="space-y-1 text-sm">
                {view.pending.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>
                      {name(p.fromMemberId)} ← {name(p.toMemberId)}
                    </span>
                    <Money value={p.amount} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "activity" && <Activity groupId={groupId} actor={actor} memberName={name} />}

      <Link
        href={`${base}/expenses/new`}
        aria-label="ثبت هزینه جدید"
        className="fixed bottom-24 left-4 z-10 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 sm:left-[calc(50%-17rem)]"
      >
        <PlusIcon size={28} />
      </Link>
    </>
  );
}

async function Activity({
  groupId,
  actor,
  memberName,
}: {
  groupId: string;
  actor: { userId: string };
  memberName: (id: string) => string;
}) {
  const rows = await getActivity(actor, groupId);
  if (rows.length === 0) return <EmptyState title="هنوز فعالیتی ثبت نشده" />;
  return (
    <ul className="space-y-2">
      {rows.map(({ log, actorName }) => (
        <li key={log.id} className="card py-3 text-sm">
          <p>
            <strong>{actorName}</strong> {describeAudit(log, memberName)}
          </p>
          <p className="mt-1 text-xs text-muted">{formatJalaliDateTime(log.at)}</p>
          {log.entityType === "expense" && log.action !== "delete" && (
            <Link href={`/groups/${groupId}/expenses/${log.entityId}`} className="mt-1 inline-block text-xs text-primary">
              مشاهده
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
