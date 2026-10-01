import type { Metadata } from "next";
import Link from "next/link";
import { Balance, balanceHint, EmptyState, Money, PageHeader } from "@/components/ui";
import { formatToman } from "@/domain/money";
import { formatJalaliDate } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getBalanceExplanation } from "@/server/queries";

export const metadata: Metadata = { title: "توضیح مانده" };

const KIND_LABEL = {
  expense: "هزینه",
  refund: "برگشت",
  settlement_paid: "پرداخت تسویه",
  settlement_received: "دریافت تسویه",
} as const;

export default async function BalancePage(props: PageProps<"/groups/[groupId]/balance/[memberId]">) {
  const { groupId, memberId } = await props.params;
  const { eventId } = await props.searchParams;
  const user = await requireUser(`/groups/${groupId}/balance/${memberId}`);
  const scope = typeof eventId === "string" ? eventId : undefined;
  const data = await orNotFound(getBalanceExplanation({ userId: user.id }, groupId, memberId, scope));
  const scopeTitle = scope ? data.eventTitles.get(scope) : null;
  // Running total after each line, so the last value visibly equals the balance.
  const runningTotals = data.lines.reduce<bigint[]>((acc, l) => [...acc, (acc.at(-1) ?? 0n) + l.effect], []);

  return (
    <>
      <PageHeader
        title={`مانده ${data.member.name}${data.member.isMe ? " (من)" : ""}`}
        back={scope ? { href: `/groups/${groupId}/events/${scope}`, label: scopeTitle ?? "رویداد" } : { href: `/groups/${groupId}?tab=balances`, label: "مانده‌ها" }}
        subtitle={scopeTitle ? `فقط در رویداد «${scopeTitle}»` : "در کل گروه"}
      />
      <div className="space-y-4">
        <section className="card text-center">
          <Balance value={data.total} className="text-2xl" />
          <p className="mt-1 text-sm text-muted">{balanceHint(data.total)}</p>
        </section>

        {data.lines.length === 0 ? (
          <EmptyState title="هیچ قلمی روی این مانده اثر نگذاشته است" />
        ) : (
          <section className="card">
            <h2 className="mb-1 font-bold">قلم‌به‌قلم</h2>
            <p className="mb-3 text-xs leading-6 text-muted">
              اثر هر هزینه = پرداختی − سهم. برگشت خرید برعکس حساب می‌شود. جمع ستون «اثر» دقیقاً برابر مانده است.
            </p>
            <ol className="divide-y divide-border text-sm">
              {data.lines.map((l, i) => {
                const href = l.kind === "expense" || l.kind === "refund" ? `/groups/${groupId}/expenses/${l.refId}` : null;
                return (
                  <li key={`${l.kind}-${l.refId}`} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="text-xs text-muted">{KIND_LABEL[l.kind]} · </span>
                        {href ? (
                          <Link href={href} className="text-primary">
                            {l.title}
                          </Link>
                        ) : (
                          l.title
                        )}
                        {!scope && l.eventId && (
                          <span className="block text-xs text-muted">{data.eventTitles.get(l.eventId)}</span>
                        )}
                      </span>
                      <Balance value={l.effect} className="shrink-0 text-sm" />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {l.date && `${formatJalaliDate(l.date)} · `}
                      {l.kind === "expense" && `پرداخت ${formatToman(l.paid)} − سهم ${formatToman(l.share)}`}
                      {l.kind === "refund" && `سهم برگشت ${formatToman(l.share)} − دریافتی ${formatToman(l.paid)}`}
                      {(l.kind === "settlement_paid" || l.kind === "settlement_received") && formatToman(l.paid)}
                      {" · جمع تا اینجا: "}
                      {formatToman(runningTotals[i], { signed: true })}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {data.pendingLines.length > 0 && (
          <section className="card">
            <h2 className="mb-1 font-bold">تسویه‌های در انتظار تأیید</h2>
            <p className="mb-2 text-xs text-muted">این‌ها هنوز در مانده بالا حساب نشده‌اند.</p>
            <ul className="space-y-1 text-sm">
              {data.pendingLines.map((l) => (
                <li key={l.refId} className="flex justify-between">
                  <span>{KIND_LABEL[l.kind]}</span>
                  <Money value={l.paid} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
