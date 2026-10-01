"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateExpenseAction } from "@/app/actions";
import { DomainError } from "@/domain/errors";
import { formatToman } from "@/domain/money";
import { computeShares, formatScaled2, parseScaled2, SPLIT_TYPES, type SplitType } from "@/domain/split";
import { CATEGORY_LABELS, SPLIT_LABELS, todayIso } from "@/lib/format";
import { newClientKey } from "@/lib/offline/queue";
import { AmountInput, cleanDigits, JalaliDateInput } from "./inputs";
import { PendingOps } from "./PendingOps";
import { useSync } from "./SyncProvider";
import { Notice } from "./ui";

export interface FormMember {
  id: string;
  name: string;
  isMe: boolean;
}

export interface ExpenseInitial {
  expenseId: string;
  version: number;
  title: string;
  category: string;
  date: string;
  eventId: string | null;
  totalAmount: string;
  splitType: SplitType;
  note: string | null;
  payers: { memberId: string; amount: string }[];
  shares: { memberId: string; inputValue: string }[];
}

const VALUE_HINT: Record<SplitType, string> = {
  equal: "",
  exact: "مبلغ هر نفر (تومان)",
  percent: "درصد هر نفر",
  shares: "سهم هر نفر (مثلاً تعداد شب)",
};

export function ExpenseForm({
  groupId,
  members,
  events,
  defaultEventId,
  initial,
  returnTo,
}: {
  groupId: string;
  members: FormMember[];
  events: { id: string; title: string }[];
  defaultEventId: string | null;
  initial?: ExpenseInitial;
  returnTo: string;
}) {
  const router = useRouter();
  const { submit } = useSync();
  const me = members.find((m) => m.isMe) ?? members[0];
  const [clientKey] = useState(() => newClientKey());
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial?.totalAmount ?? "");
  const [category, setCategory] = useState(initial?.category ?? "food");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [eventId, setEventId] = useState<string | null>(initial ? initial.eventId : defaultEventId);
  const [note, setNote] = useState(initial?.note ?? "");

  const [multiPayer, setMultiPayer] = useState((initial?.payers.length ?? 1) > 1);
  const [singlePayer, setSinglePayer] = useState(initial?.payers[0]?.memberId ?? me.id);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>(
    Object.fromEntries((initial?.payers ?? []).map((p) => [p.memberId, p.amount])),
  );

  const [splitType, setSplitType] = useState<SplitType>(initial?.splitType ?? "equal");
  const [included, setIncluded] = useState<Set<string>>(
    new Set(initial ? initial.shares.map((s) => s.memberId) : members.map((m) => m.id)),
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!initial) return {};
    return Object.fromEntries(
      initial.shares.map((s) => {
        const v = BigInt(s.inputValue);
        const text = initial.splitType === "exact" ? s.inputValue : initial.splitType === "equal" ? "" : formatScaled2(v);
        return [s.memberId, text];
      }),
    );
  });

  const toggle = (id: string) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Converts the form to the wire payload, or returns a Persian error. */
  const built = useMemo(() => {
    try {
      if (!amount || BigInt(amount) <= 0n) return { error: "مبلغ را وارد کنید." };
      const total = BigInt(amount);
      const payers = multiPayer
        ? Object.entries(payerAmounts)
            .filter(([, v]) => v && BigInt(v) > 0n)
            .map(([memberId, v]) => ({ memberId, amount: v }))
        : [{ memberId: singlePayer, amount }];
      const sharers = members.filter((m) => included.has(m.id));
      if (sharers.length === 0) return { error: "حداقل یک نفر باید در هزینه سهیم باشد." };
      const shares = sharers.map((m) => {
        const text = values[m.id] ?? "";
        let value: bigint;
        if (splitType === "equal") value = 0n;
        else if (splitType === "exact") value = BigInt(cleanDigits(text) || "0");
        else value = parseScaled2(text || (splitType === "shares" ? "1" : "0"));
        return { memberId: m.id, value };
      });
      const preview = computeShares(total, splitType, shares);
      const payerSum = payers.reduce((a, p) => a + BigInt(p.amount), 0n);
      if (payerSum !== total) {
        return { error: `جمع پرداخت‌ها (${formatToman(payerSum)}) با مبلغ کل برابر نیست.`, preview };
      }
      return {
        preview,
        payload: {
          groupId,
          eventId,
          title: title.trim(),
          category,
          date,
          totalAmount: amount,
          splitType,
          payers,
          shares: shares.map((s) => ({ memberId: s.memberId, value: s.value.toString() })),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      };
    } catch (e) {
      return { error: e instanceof DomainError ? e.message : "مقادیر واردشده معتبر نیست." };
    }
  }, [amount, multiPayer, payerAmounts, singlePayer, members, included, values, splitType, groupId, eventId, title, category, date, note]);

  const previewById = new Map((built.preview ?? []).map((p) => [p.memberId, p.amount]));
  const exactSum =
    splitType === "exact"
      ? members.filter((m) => included.has(m.id)).reduce((a, m) => a + BigInt(cleanDigits(values[m.id] ?? "") || "0"), 0n)
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("عنوان هزینه را وارد کنید.");
    if (!built.payload) return setError(built.error ?? "فرم کامل نیست.");

    if (initial) {
      startTransition(async () => {
        const r = await updateExpenseAction(groupId, initial.expenseId, initial.version, built.payload);
        if (r && !r.ok) setError(r.error ?? "ذخیره نشد.");
      });
      return;
    }

    setBusy(true);
    const outcome = await submit({
      clientKey,
      type: "expense.create",
      groupId,
      label: `${built.payload.title} — ${formatToman(BigInt(amount))}`,
      payload: built.payload,
    });
    setBusy(false);
    if (outcome.kind === "saved") {
      router.push(`/groups/${groupId}/expenses/${outcome.id}`);
      router.refresh();
    } else if (outcome.kind === "queued") {
      // Offline: stay here (the next page needs the network). The item is listed as pending
      // and is sent automatically once the connection returns.
      setQueued(true);
    } else {
      setError(outcome.message);
    }
  }

  const disabled = busy || isPending;

  if (queued) {
    return (
      <div className="space-y-4">
        <Notice tone="warning">
          اینترنت در دسترس نیست. هزینه روی همین دستگاه ذخیره شد و با برگشت اتصال خودکار ارسال می‌شود.
        </Notice>
        <PendingOps groupId={groupId} />
        <Link href={returnTo} className="btn-secondary w-full">
          بازگشت
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="title" className="label">
          عنوان
        </label>
        <input
          id="title"
          className="input"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثلاً شام شب اول"
          required
        />
      </div>

      <AmountInput id="amount" label="مبلغ کل" value={amount} onChange={setAmount} required />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category" className="label">
            دسته
          </label>
          <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="event" className="label">
            رویداد
          </label>
          <select
            id="event"
            className="input"
            value={eventId ?? ""}
            onChange={(e) => setEventId(e.target.value || null)}
          >
            <option value="">بدون رویداد (حساب عمومی)</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <JalaliDateInput id="date" label="تاریخ" value={date} onChange={(v) => v && setDate(v)} />

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">چه کسی پرداخت کرد؟</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={multiPayer} onChange={(e) => setMultiPayer(e.target.checked)} />
            چند نفر
          </label>
        </div>
        {!multiPayer ? (
          <select aria-label="پرداخت‌کننده" className="input" value={singlePayer} onChange={(e) => setSinglePayer(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isMe ? " (من)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-sm">{m.name}</span>
                <input
                  aria-label={`پرداخت ${m.name}`}
                  inputMode="numeric"
                  className="input tabular"
                  placeholder="۰"
                  value={payerAmounts[m.id] ? new Intl.NumberFormat("fa-IR").format(BigInt(payerAmounts[m.id])) : ""}
                  onChange={(e) => setPayerAmounts((p) => ({ ...p, [m.id]: cleanDigits(e.target.value).slice(0, 16) }))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">چطور تقسیم شود؟</h2>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="نوع تقسیم">
          {SPLIT_TYPES.map((t) => (
            <button
              type="button"
              role="radio"
              aria-checked={splitType === t}
              key={t}
              onClick={() => setSplitType(t)}
              className={`rounded-lg px-1 py-2 text-xs font-medium ${splitType === t ? "bg-surface text-primary shadow-sm" : "text-muted"}`}
            >
              {SPLIT_LABELS[t]}
            </button>
          ))}
        </div>
        {VALUE_HINT[splitType] && <p className="text-xs text-muted">{VALUE_HINT[splitType]}</p>}
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const on = included.has(m.id);
            return (
              <li key={m.id} className="flex items-center gap-2 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => toggle(m.id)} />
                  <span className="truncate text-sm">
                    {m.name}
                    {m.isMe ? " (من)" : ""}
                  </span>
                </label>
                {on && splitType !== "equal" && (
                  <input
                    aria-label={`${VALUE_HINT[splitType]} — ${m.name}`}
                    inputMode="decimal"
                    className="input min-h-9 w-24 text-center tabular"
                    placeholder={splitType === "shares" ? "۱" : "۰"}
                    value={
                      splitType === "exact" && values[m.id]
                        ? new Intl.NumberFormat("fa-IR").format(BigInt(cleanDigits(values[m.id]) || "0"))
                        : (values[m.id] ?? "")
                    }
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [m.id]: splitType === "exact" ? cleanDigits(e.target.value).slice(0, 16) : e.target.value,
                      }))
                    }
                  />
                )}
                <span className="w-28 shrink-0 text-left text-sm tabular text-muted" data-testid={`share-${m.name}`}>
                  {on && previewById.has(m.id) ? formatToman(previewById.get(m.id)!) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
        {exactSum !== null && amount && (
          <p className="text-xs text-muted">
            جمع واردشده: {formatToman(exactSum)} از {formatToman(BigInt(amount))}
          </p>
        )}
      </section>

      <div>
        <label htmlFor="note" className="label">
          توضیح (اختیاری)
        </label>
        <textarea id="note" className="input min-h-20 py-2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {(error || (built.error && amount)) && <Notice tone="error">{error ?? built.error}</Notice>}

      <button type="submit" className="btn-primary w-full" disabled={disabled}>
        {disabled ? "در حال ذخیره…" : initial ? "ذخیره تغییرات" : "ثبت هزینه"}
      </button>
      {!initial && (
        <p className="text-center text-xs text-muted">اگر اینترنت قطع باشد، هزینه روی همین دستگاه نگه داشته و بعداً ارسال می‌شود.</p>
      )}
    </form>
  );
}
