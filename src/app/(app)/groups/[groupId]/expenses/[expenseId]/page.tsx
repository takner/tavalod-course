import type { Metadata } from "next";
import Link from "next/link";
import { deleteExpenseAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { Chip, Money, Notice, PageHeader } from "@/components/ui";
import { formatToman } from "@/domain/money";
import { formatScaled2 } from "@/domain/split";
import { CATEGORY_LABELS, formatJalaliDate, formatJalaliDateTime, SPLIT_LABELS } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getExpenseView } from "@/server/queries";

export const metadata: Metadata = { title: "هزینه" };

type Snap = {
  expense: { title: string; totalAmount: string; date: string; splitType: string; eventId: string | null };
  payers: { memberId: string; amount: string }[];
  shares: { memberId: string; amount: string }[];
} | null;

export default async function ExpensePage(props: PageProps<"/groups/[groupId]/expenses/[expenseId]">) {
  const { groupId, expenseId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/expenses/${expenseId}`);
  const view = await orNotFound(getExpenseView({ userId: user.id }, groupId, expenseId));
  const e = view.expense;
  const name = (id: string) => view.members.find((m) => m.id === id)?.name ?? "—";
  const isRefund = e.kind === "refund";
  const frozen = view.event?.status === "closed";
  const back = view.event ? { href: `/groups/${groupId}/events/${view.event.id}`, label: view.event.title } : { href: `/groups/${groupId}`, label: "گروه" };
  const inputLabel = (v: bigint) =>
    e.splitType === "percent" ? `${formatScaled2(v)}٪` : e.splitType === "shares" ? `${formatScaled2(v)} سهم` : null;

  return (
    <>
      <PageHeader
        title={e.title}
        back={back}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Chip>{CATEGORY_LABELS[e.category]}</Chip>
            {isRefund && <Chip tone="positive">برگشت خرید</Chip>}
            {e.deletedAt && <Chip tone="negative">حذف‌شده</Chip>}
            <span>{formatJalaliDate(e.date)}</span>
          </span>
        }
      />
      <div className="space-y-4">
        {e.deletedAt && <Notice tone="warning">این هزینه حذف شده و در مانده‌ها حساب نمی‌شود. سابقه آن برای شفافیت نگه داشته شده است.</Notice>}
        {view.original && (
          <Notice>
            این برگشت مربوط به هزینه{" "}
            <Link className="underline" href={`/groups/${groupId}/expenses/${view.original.id}`}>
              «{view.original.title}»
            </Link>{" "}
            است و اثر آن را به همان نسبت برمی‌گرداند.
          </Notice>
        )}

        <section className="card">
          <p className="text-xs text-muted">{isRefund ? "مبلغ برگشتی" : "مبلغ کل"}</p>
          <Money value={e.totalAmount} className="text-2xl font-bold" />
          <p className="mt-1 text-xs text-muted">نوع تقسیم: {SPLIT_LABELS[e.splitType]}</p>
          {e.note && <p className="mt-2 text-sm leading-7">{e.note}</p>}
        </section>

        <section className="card">
          <h2 className="mb-2 font-bold">{isRefund ? "دریافت‌کنندگان پول برگشتی" : "پرداخت‌کنندگان"}</h2>
          <ul className="space-y-1 text-sm">
            {view.payers.map((p) => (
              <li key={p.memberId} className="flex justify-between">
                <span>{name(p.memberId)}</span>
                <Money value={p.amount} />
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb-2 font-bold">{isRefund ? "سهم برگشت هر نفر" : "سهم هر نفر"}</h2>
          <ul className="space-y-1 text-sm">
            {view.shares.map((s) => (
              <li key={s.memberId} className="flex justify-between gap-2">
                <span>
                  {name(s.memberId)}
                  {inputLabel(s.inputValue) && <span className="text-xs text-muted"> ({inputLabel(s.inputValue)})</span>}
                </span>
                <Money value={s.amount} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            اثر روی مانده هر نفر = {isRefund ? "سهم برگشت − پول دریافتی" : "پرداخت − سهم"}. اگر تقسیم بخش‌پذیر نباشد، باقیمانده
            به‌صورت ثابت و یک‌تومانی میان افراد پخش می‌شود.
          </p>
        </section>

        {!isRefund && view.refunds.length > 0 && (
          <section className="card">
            <h2 className="mb-2 font-bold">برگشت‌های این هزینه</h2>
            <ul className="space-y-1 text-sm">
              {view.refunds.map((r) => (
                <li key={r.id} className={`flex justify-between ${r.deletedAt ? "line-through opacity-50" : ""}`}>
                  <Link href={`/groups/${groupId}/expenses/${r.id}`} className="text-primary">
                    {formatJalaliDate(r.date)}
                  </Link>
                  <Money value={r.totalAmount} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">باقیمانده قابل برگشت: {formatToman(view.refundable)}</p>
          </section>
        )}

        {view.canEdit && !frozen && (
          <div className="flex flex-wrap gap-2">
            {!isRefund && (
              <Link href={`/groups/${groupId}/expenses/${expenseId}/edit`} className="btn-secondary">
                ویرایش
              </Link>
            )}
            {!isRefund && view.refundable > 0n && (
              <Link href={`/groups/${groupId}/expenses/${expenseId}/refund`} className="btn-secondary">
                ثبت برگشت خرید
              </Link>
            )}
            <ActionButton
              action={deleteExpenseAction.bind(null, groupId, expenseId, e.version)}
              className="btn-danger"
              confirmText="این هزینه حذف شود؟ سابقه آن باقی می‌ماند و افراد مرتبط مطلع می‌شوند."
            >
              حذف
            </ActionButton>
          </div>
        )}
        {frozen && <Notice tone="info">رویداد این هزینه بسته شده است؛ برای تغییر، ابتدا رویداد را دوباره باز کنید.</Notice>}

        <section className="card">
          <h2 className="mb-2 font-bold">سابقه تغییرات</h2>
          <ol className="space-y-3 text-sm">
            {view.history.map((h) => {
              const before = h.before as Snap;
              const after = h.after as Snap;
              return (
                <li key={h.id} className="border-r-2 border-border pr-3">
                  <p>
                    <strong>{h.actorName}</strong>{" "}
                    {{ create: "ثبت کرد", update: "ویرایش کرد", delete: "حذف کرد", refund: "برگشت را ثبت کرد" }[h.action] ?? h.action}
                  </p>
                  <p className="text-xs text-muted">{formatJalaliDateTime(h.at)}</p>
                  {h.action === "update" && before && after && <Diff before={before} after={after} name={name} />}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}

function Diff({ before, after, name }: { before: NonNullable<Snap>; after: NonNullable<Snap>; name: (id: string) => string }) {
  const lines: string[] = [];
  const m = (v: string) => formatToman(BigInt(v));
  if (before.expense.title !== after.expense.title) lines.push(`عنوان: «${before.expense.title}» ← «${after.expense.title}»`);
  if (before.expense.totalAmount !== after.expense.totalAmount) lines.push(`مبلغ: ${m(before.expense.totalAmount)} ← ${m(after.expense.totalAmount)}`);
  if (before.expense.date !== after.expense.date) lines.push(`تاریخ: ${formatJalaliDate(before.expense.date)} ← ${formatJalaliDate(after.expense.date)}`);
  if (before.expense.splitType !== after.expense.splitType) lines.push(`تقسیم: ${SPLIT_LABELS[before.expense.splitType]} ← ${SPLIT_LABELS[after.expense.splitType]}`);
  const map = (xs: { memberId: string; amount: string }[]) => new Map(xs.map((x) => [x.memberId, x.amount]));
  const describe = (label: string, b: Map<string, string>, a: Map<string, string>) => {
    for (const id of new Set([...b.keys(), ...a.keys()])) {
      const x = b.get(id);
      const y = a.get(id);
      if (x === y) continue;
      lines.push(`${label} ${name(id)}: ${x ? m(x) : "—"} ← ${y ? m(y) : "—"}`);
    }
  };
  describe("پرداخت", map(before.payers), map(after.payers));
  describe("سهم", map(before.shares), map(after.shares));
  if (lines.length === 0) return null;
  return (
    <ul className="mt-1 list-inside list-disc text-xs leading-6 text-muted">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
