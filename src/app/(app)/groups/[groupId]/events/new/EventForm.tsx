"use client";

import { useActionState } from "react";
import { createEventAction } from "@/app/actions";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { JalaliDateInput } from "@/components/inputs";
import { EVENT_TYPE_LABELS, todayIso } from "@/lib/format";

export function EventForm({
  groupId,
  members,
  template,
}: {
  groupId: string;
  members: { id: string; name: string; isMe: boolean }[];
  template: { id: string; title: string; type: string; checklist: string[] } | null;
}) {
  const [state, action] = useActionState(createEventAction.bind(null, groupId), initialActionState);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="ev-title" className="label">
          عنوان
        </label>
        <input id="ev-title" name="title" className="input" maxLength={120} placeholder="مثلاً سفر شمال" defaultValue={template?.title} required />
      </div>
      <div>
        <label htmlFor="ev-type" className="label">
          نوع
        </label>
        <select id="ev-type" name="type" className="input" defaultValue={template?.type ?? "trip"}>
          {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <JalaliDateInput id="ev-start" name="startDate" label="تاریخ شروع" value={todayIso()} allowEmpty />
      <JalaliDateInput id="ev-end" name="endDate" label="تاریخ پایان (اختیاری)" value={null} allowEmpty />
      <fieldset className="card">
        <legend className="px-1 text-sm font-bold">شرکت‌کنندگان</legend>
        <p className="mb-2 text-xs leading-6 text-muted">
          شرکت در رویداد کسی را بدهکار نمی‌کند؛ سهم هر نفر فقط از هزینه‌هایی می‌آید که در آن‌ها سهیم است.
        </p>
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.id}>
              <label className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" name="participants" value={m.id} defaultChecked />
                {m.name}
                {m.isMe && " (من)"}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {template && (
        <fieldset className="card">
          <legend className="px-1 text-sm font-bold">چک‌لیست پیشنهادی</legend>
          {template.checklist.map((t) => (
            <label key={t} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" name="task" value={t} defaultChecked />
              {t}
            </label>
          ))}
        </fieldset>
      )}
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ساخت رویداد</SubmitButton>
    </form>
  );
}
