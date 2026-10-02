"use client";

import { useActionState } from "react";
import { decidePollAction, voteAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { OnlineOnly } from "@/components/OnlineOnly";

export function VoteForm({ groupId, pollId, multi, options, mine }: { groupId: string; pollId: string; multi: boolean; options: { id: string; label: string }[]; mine: string[] }) {
  const [state, action] = useActionState(voteAction.bind(null, groupId, pollId), initialActionState);
  return (
    <OnlineOnly>
      <form action={action} className="space-y-2">
        {multi && <p className="text-xs text-muted">همه گزینه‌های مناسب را انتخاب کنید.</p>}
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
            <input type={multi ? "checkbox" : "radio"} name="option" value={o.id} defaultChecked={mine.includes(o.id)} />
            {o.label}
          </label>
        ))}
        <ActionMessage state={state} />
        <SubmitButton className="btn-primary w-full">{mine.length ? "به‌روزرسانی رأی" : "ثبت رأی"}</SubmitButton>
      </form>
    </OnlineOnly>
  );
}

export function DecideForm({ groupId, pollId, options, canApply, current }: { groupId: string; pollId: string; options: { id: string; label: string }[]; canApply: boolean; current: string | null }) {
  const [state, action] = useActionState(decidePollAction.bind(null, groupId, pollId), initialActionState);
  return (
    <form action={action} className="space-y-2">
      <p className="text-sm font-medium">۲. اعلام تصمیم نهایی</p>
      <select name="option" className="input" defaultValue={current ?? options[0]?.id} aria-label="گزینه نهایی">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <input name="note" className="input" maxLength={300} placeholder="توضیح (اختیاری)" aria-label="توضیح" />
      {canApply && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="apply" defaultChecked />
          روی رویداد هم اعمال شود (زمان یا مکان رویداد تنظیم شود)
        </label>
      )}
      <p className="text-xs text-muted">اعلام تصمیم چیزی را رزرو یا خرید نمی‌کند.</p>
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">اعلام تصمیم</SubmitButton>
    </form>
  );
}
