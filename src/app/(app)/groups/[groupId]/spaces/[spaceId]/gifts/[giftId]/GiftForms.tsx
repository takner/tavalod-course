"use client";

import { useActionState, useMemo, useState } from "react";
import { giftPaymentAction, pledgeAction, purchaseAction, reallocateAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { ImagePicker } from "@/components/ImagePicker";
import { AmountInput, cleanDigits, JalaliDateInput } from "@/components/inputs";
import { formatToman } from "@/domain/money";
import { distributeByWeights } from "@/domain/split";
import { METHOD_LABELS, todayIso } from "@/lib/format";
import { newClientKey } from "@/lib/offline/queue";

export function PledgeForm({ groupId, spaceId, giftId, suggestion, current }: { groupId: string; spaceId: string; giftId: string; suggestion: string | null; current: string | null }) {
  const [state, action] = useActionState(pledgeAction.bind(null, groupId, spaceId, giftId), initialActionState);
  const [amount, setAmount] = useState(current ?? suggestion ?? "");
  return (
    <form action={action} className="space-y-2">
      {suggestion && <p className="text-xs text-muted">سهم پیشنهادی مساوی: {formatToman(BigInt(suggestion))}</p>}
      <AmountInput id="pledge" name="amount" label="حداکثر مبلغی که مشارکت می‌کنم" value={amount} onChange={setAmount} />
      <p className="hint">این فقط تعهد است: پولی جابه‌جا نمی‌شود و بدهی ساخته نمی‌شود. سهم نهایی شما از این سقف بیشتر نمی‌شود.</p>
      <ActionMessage state={state} />
      <div className="flex gap-2">
        <button name="decision" value="pledge" className="btn-primary flex-1">
          {current ? "به‌روزرسانی تعهد" : suggestion && amount === suggestion ? "قبول سهم پیشنهادی" : "ثبت تعهد"}
        </button>
        <button name="decision" value="decline" className="btn-secondary">
          مشارکت نمی‌کنم
        </button>
      </div>
    </form>
  );
}

export function PaymentForm({
  groupId,
  spaceId,
  giftId,
  purpose,
  from,
  to,
  options,
  suggested,
}: {
  groupId: string;
  spaceId: string;
  giftId: string;
  purpose: "collection" | "refund";
  from: string;
  to: string | null;
  options?: { id: string; name: string; owed: string }[];
  suggested: string;
}) {
  // One idempotency key per form instance: double taps or retries cannot record the payment twice.
  const [clientKey, setClientKey] = useState(() => newClientKey());
  const [amount, setAmount] = useState(to ? (suggested === "0" ? "" : suggested) : (options?.[0]?.owed ?? ""));
  const [target, setTarget] = useState(to ?? options?.[0]?.id ?? "");
  const [state, action] = useActionState(async (prev: typeof initialActionState, fd: FormData) => {
    const r = await giftPaymentAction(groupId, spaceId, giftId, purpose, clientKey, prev, fd);
    if (r.ok) {
      setClientKey(newClientKey());
      setAmount("");
    }
    return r;
  }, initialActionState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="from" value={from} />
      {to ? (
        <input type="hidden" name="to" value={to} />
      ) : (
        <select name="to" className="input" value={target} aria-label="به چه کسی" onChange={(e) => {
          setTarget(e.target.value);
          const o = options?.find((x) => x.id === e.target.value);
          if (o) setAmount(o.owed);
        }}>
          {(options ?? []).length === 0 && <option value="">کسی طلبکار نیست</option>}
          {options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} (طلب {formatToman(BigInt(o.owed))})
            </option>
          ))}
        </select>
      )}
      <AmountInput id={`pay-${purpose}`} name="amount" label="مبلغ" value={amount} onChange={setAmount} />
      <select name="method" className="input" aria-label="روش" defaultValue="bank_transfer">
        {Object.entries(METHOD_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">{purpose === "refund" ? "ثبت بازپرداخت" : "پرداخت کردم"}</SubmitButton>
    </form>
  );
}

export function PurchaseForm({ groupId, spaceId, giftId, contributors }: { groupId: string; spaceId: string; giftId: string; contributors: { id: string; name: string; cap: string }[] }) {
  const [state, action] = useActionState(purchaseAction.bind(null, groupId, spaceId, giftId), initialActionState);
  const [total, setTotal] = useState("");
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const equal = useMemo(
    () => (total ? new Map(distributeByWeights(BigInt(total), contributors.map((c) => ({ memberId: c.id, weight: 1n }))).map((s) => [s.memberId, s.amount])) : new Map<string, bigint>()),
    [total, contributors],
  );
  const customSum = contributors.reduce((a, c) => a + BigInt(custom[c.id] || "0"), 0n);
  return (
    <form action={action} className="space-y-3">
      <AmountInput id="pur-total" name="total" label="مبلغ واقعی خرید" value={total} onChange={setTotal} required />
      <JalaliDateInput id="pur-date" name="date" label="تاریخ خرید" value={todayIso()} />
      <ImagePicker name="receipt" label="عکس رسید (اختیاری؛ فقط اعضای این فضا می‌بینند)" />
      <input name="note" className="input" maxLength={500} placeholder="یادداشت (اختیاری)" aria-label="یادداشت" />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="نحوه تقسیم">
        {(["equal", "custom"] as const).map((m) => (
          <label key={m} className={`cursor-pointer rounded-lg py-2 text-center text-sm ${mode === m ? "bg-surface font-bold text-primary" : "text-muted"}`}>
            <input type="radio" name="splitMode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
            {m === "equal" ? "مساوی بین متعهدها" : "تقسیم دستی"}
          </label>
        ))}
      </div>
      <ul className="divide-y divide-border text-sm">
        {contributors.map((c) => {
          const share = mode === "equal" ? equal.get(c.id) : BigInt(custom[c.id] || "0");
          const over = share !== undefined && share > BigInt(c.cap);
          return (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <span className="flex-1">
                {c.name}
                <span className="block text-xs text-muted">سقف {formatToman(BigInt(c.cap))}</span>
              </span>
              {mode === "custom" ? (
                <>
                  <input type="hidden" name="shareMember" value={c.id} />
                  <input
                    name="shareAmount"
                    inputMode="numeric"
                    className={`input min-h-9 w-32 tabular ${over ? "border-negative" : ""}`}
                    aria-label={`سهم ${c.name}`}
                    value={custom[c.id] ? new Intl.NumberFormat("fa-IR").format(BigInt(custom[c.id])) : ""}
                    onChange={(e) => setCustom((s) => ({ ...s, [c.id]: cleanDigits(e.target.value).slice(0, 16) }))}
                  />
                </>
              ) : (
                <span className={`tabular ${over ? "text-negative" : ""}`}>{share !== undefined ? formatToman(share) : "—"}</span>
              )}
            </li>
          );
        })}
      </ul>
      {mode === "custom" && total && <p className={`text-xs ${customSum === BigInt(total) ? "text-muted" : "text-negative"}`}>جمع سهم‌ها: {formatToman(customSum)} از {formatToman(BigInt(total))}</p>}
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ثبت خرید</SubmitButton>
    </form>
  );
}

export function ReallocateForm({ groupId, spaceId, giftId, targets }: { groupId: string; spaceId: string; giftId: string; targets: { id: string; title: string }[] }) {
  const [state, action] = useActionState(reallocateAction.bind(null, groupId, spaceId, giftId), initialActionState);
  const [amount, setAmount] = useState("");
  return (
    <form action={action} className="space-y-2">
      <select name="toGiftId" className="input" aria-label="هدیه مقصد">
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <AmountInput id="realloc" name="amount" label="مبلغ" value={amount} onChange={setAmount} />
      <ActionMessage state={state} />
      <SubmitButton className="btn-secondary w-full">انتقال</SubmitButton>
    </form>
  );
}
