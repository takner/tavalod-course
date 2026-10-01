"use client";

import { useActionState, useState } from "react";
import { createRefundAction } from "@/app/actions";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { AmountInput, JalaliDateInput } from "@/components/inputs";
import { todayIso } from "@/lib/format";
import { newClientKey } from "@/lib/offline/queue";

export function RefundForm({
  groupId,
  expenseId,
  refundable,
  payers,
}: {
  groupId: string;
  expenseId: string;
  refundable: string;
  payers: { id: string; name: string }[];
}) {
  // One key per form instance: a double submit or a retry cannot record the refund twice.
  const [clientKey] = useState(() => newClientKey());
  const [amount, setAmount] = useState(refundable);
  const [state, action] = useActionState(createRefundAction.bind(null, groupId, expenseId, clientKey), initialActionState);
  return (
    <form action={action} className="space-y-4">
      <AmountInput id="refund-amount" name="amount" label="مبلغ برگشتی" value={amount} onChange={setAmount} required />
      <div className="flex gap-2">
        <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => setAmount(refundable)}>
          برگشت کامل
        </button>
      </div>
      <JalaliDateInput id="refund-date" name="date" label="تاریخ" value={todayIso()} />
      <div>
        <label htmlFor="receiver" className="label">
          پول برگشتی به دست چه کسی رسید؟
        </label>
        <select id="receiver" name="receiver" className="input" defaultValue="">
          <option value="">پرداخت‌کنندگان اصلی، به همان نسبت</option>
          {payers.map((p) => (
            <option key={p.id} value={p.id}>
              فقط {p.name}
            </option>
          ))}
        </select>
        <p className="hint">سهم برگشت هر نفر به نسبت سهمش در هزینه اصلی محاسبه می‌شود.</p>
      </div>
      <div>
        <label htmlFor="refund-note" className="label">
          توضیح (اختیاری)
        </label>
        <input id="refund-note" name="note" className="input" maxLength={500} placeholder="مثلاً لغو رزرو" />
      </div>
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ثبت برگشت</SubmitButton>
    </form>
  );
}
