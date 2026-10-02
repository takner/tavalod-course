"use client";

import { useActionState, useState } from "react";
import { createPollAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { JalaliDateInput } from "@/components/inputs";
import { POLL_KIND_LABELS, todayIso } from "@/lib/format";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const PLACEHOLDER: Record<string, string> = {
  datetime: "کی دور هم باشیم؟",
  place: "کجا برگزار کنیم؟",
  activity: "چه برنامه‌ای داشته باشیم؟",
  budget: "بودجه هر نفر چقدر باشد؟",
  gift: "کدام هدیه را بگیریم؟",
  custom: "سؤال شما",
};

export function PollForm({ groupId, eventId, spaceId, defaultKind }: { groupId: string; eventId: string | null; spaceId: string | null; defaultKind: string }) {
  const [state, action] = useActionState(createPollAction.bind(null, groupId), initialActionState);
  const [kind, setKind] = useState(defaultKind);
  const [count, setCount] = useState(3);
  const kinds = Object.keys(POLL_KIND_LABELS).filter((k) => (spaceId ? true : k !== "gift"));
  return (
    <form action={action} className="space-y-4">
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      {spaceId && <input type="hidden" name="spaceId" value={spaceId} />}
      <div>
        <label htmlFor="pl-kind" className="label">
          موضوع
        </label>
        <select id="pl-kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {POLL_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="pl-q" className="label">
          سؤال
        </label>
        <input id="pl-q" name="question" className="input" maxLength={200} required placeholder={PLACEHOLDER[kind]} />
      </div>
      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-bold">گزینه‌ها</legend>
        {Array.from({ length: count }, (_, i) =>
          kind === "datetime" ? (
            <div key={`dt-${i}`} className="space-y-1 rounded-xl bg-surface-2 p-2">
              <JalaliDateInput id={`opt-date-${i}`} name="optionDate" label={`زمان ${i + 1}`} value={i < 2 ? addDays(todayIso(), i + 1) : null} allowEmpty />
              <input name="optionTime" type="time" className="input min-h-9" dir="ltr" defaultValue="19:00" aria-label={`ساعت گزینه ${i + 1}`} />
            </div>
          ) : (
            <input key={`lb-${i}`} name="optionLabel" className="input" maxLength={120} placeholder={`گزینه ${i + 1}`} aria-label={`گزینه ${i + 1}`} />
          ),
        )}
        {count < 20 && (
          <button type="button" className="btn-ghost w-full" onClick={() => setCount((c) => c + 1)}>
            + گزینه دیگر
          </button>
        )}
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="multi" defaultChecked={kind === "datetime"} key={`multi-${kind}`} />
        <span>
          چندانتخابی
          <span className="block text-xs text-muted">{kind === "datetime" ? "هر کس همه زمان‌های مناسبش را انتخاب می‌کند." : "هر کس می‌تواند چند گزینه انتخاب کند."}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="aggregate" defaultChecked={kind === "budget"} key={`agg-${kind}`} />
        <span>
          فقط نتیجه تجمیعی نمایش داده شود
          <span className="block text-xs leading-6 text-muted">
            پاسخ هر فرد به هیچ عضو یا مدیری نشان داده نمی‌شود و نتایج تا پاسخ حداقل ۳ نفر پنهان می‌ماند. پاسخ‌ها برای جلوگیری از رأی تکراری همراه هویت ذخیره می‌شوند، پس «کاملاً ناشناس» نیست.
          </span>
        </span>
      </label>
      <div className="grid grid-cols-1 gap-2">
        <JalaliDateInput id="pl-deadline" name="deadlineDate" label="مهلت پاسخ (اختیاری)" value={null} allowEmpty />
        <input name="deadlineTime" type="time" className="input min-h-9" dir="ltr" defaultValue="23:59" aria-label="ساعت مهلت" />
      </div>
      <p className="rounded-xl bg-surface-2 p-3 text-xs leading-6 text-muted">نتیجه نظرسنجی به‌تنهایی چیزی را رزرو یا خرید نمی‌کند و تعهد مالی نمی‌سازد.</p>
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ساخت نظرسنجی</SubmitButton>
    </form>
  );
}
