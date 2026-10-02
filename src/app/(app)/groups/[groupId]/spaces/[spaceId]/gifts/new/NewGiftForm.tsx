"use client";

import { useActionState, useState } from "react";
import { createGiftAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { AmountInput, JalaliDateInput } from "@/components/inputs";
import { formatToman } from "@/domain/money";

export function NewGiftForm({
  groupId,
  spaceId,
  meId,
  members,
  items,
}: {
  groupId: string;
  spaceId: string;
  meId: string;
  members: { id: string; name: string }[];
  items: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(createGiftAction.bind(null, groupId, spaceId), initialActionState);
  const [budget, setBudget] = useState("");
  const [count, setCount] = useState(members.length);
  return (
    <form action={action} className="space-y-4">
      {items.length > 0 && (
        <div>
          <label htmlFor="gf-item" className="label">
            از ویش‌لیست (اختیاری)
          </label>
          <select id="gf-item" name="wishlistItemId" className="input" defaultValue="">
            <option value="">— هدیه مستقل —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
          <p className="hint">آیتم انتخاب‌شده برای این هدیه رزرو می‌شود تا کسی آن را تکراری نخرد (صاحب فهرست نمی‌بیند).</p>
        </div>
      )}
      <div>
        <label htmlFor="gf-title" className="label">
          عنوان هدیه
        </label>
        <input id="gf-title" name="title" className="input" maxLength={120} required placeholder="مثلاً هدفون" />
      </div>
      <input name="productUrl" className="input" dir="ltr" placeholder="لینک کالا (اختیاری)" aria-label="لینک کالا" />
      <textarea name="description" className="input min-h-16 py-2" maxLength={1000} placeholder="توضیح (رنگ، مدل، …)" aria-label="توضیح" />
      <AmountInput id="gf-budget" name="budget" label="بودجه تقریبی" value={budget} onChange={setBudget} />
      {budget && count > 0 && <p className="hint -mt-2">سهم پیشنهادی مساوی: حدود {formatToman(BigInt(budget) / BigInt(count))} برای هر نفر</p>}
      <JalaliDateInput id="gf-deadline" name="deadline" label="مهلت اعلام مشارکت (اختیاری)" value={null} allowEmpty />
      <div>
        <label htmlFor="gf-buyer" className="label">
          مسئول خرید (پول‌ها نزد او جمع می‌شود)
        </label>
        <select id="gf-buyer" name="buyer" className="input" defaultValue={meId}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="card">
        <legend className="px-1 text-sm font-bold">از چه کسانی دعوت به مشارکت شود؟</legend>
        <p className="hint mb-2">دعوت به مشارکت بدهی نمی‌سازد؛ هر کس خودش مبلغ تعهدش را اعلام می‌کند.</p>
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              name="contributors"
              value={m.id}
              defaultChecked
              onChange={(e) => setCount((c) => c + (e.target.checked ? 1 : -1))}
            />
            {m.name}
          </label>
        ))}
      </fieldset>
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ساخت هدیه</SubmitButton>
    </form>
  );
}
