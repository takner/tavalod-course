"use client";

import { useActionState, useState } from "react";
import { updateEventDetailsAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { AmountInput, JalaliDateInput } from "@/components/inputs";
import { BUDGET_LABELS, EVENT_TYPE_LABELS } from "@/lib/format";

export interface EventDefaults {
  title: string;
  type: string;
  description: string | null;
  date: string | null;
  time: string | null;
  endDate: string | null;
  locationName: string | null;
  locationNote: string | null;
  mapUrl: string | null;
  rsvpDeadline: string | null;
  celebrant: string | null;
  finalAdults: number | null;
  finalChildren: number | null;
  budgets: Record<string, string>;
}

export function EventDetailsForm({
  groupId,
  eventId,
  members,
  defaults,
}: {
  groupId: string;
  eventId: string;
  members: { id: string; name: string }[];
  defaults: EventDefaults;
}) {
  const [state, action] = useActionState(updateEventDetailsAction.bind(null, groupId, eventId), initialActionState);
  const [budgets, setBudgets] = useState<Record<string, string>>(defaults.budgets);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="ev-title" className="label">
          عنوان
        </label>
        <input id="ev-title" name="title" className="input" maxLength={120} defaultValue={defaults.title} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ev-type" className="label">
            نوع
          </label>
          <select id="ev-type" name="type" className="input" defaultValue={defaults.type}>
            {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ev-celebrant" className="label">
            صاحب تولد
          </label>
          <select id="ev-celebrant" name="celebrant" className="input" defaultValue={defaults.celebrant ?? ""}>
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-bold">زمان (به وقت تهران)</legend>
        <JalaliDateInput id="ev-date" name="date" label="تاریخ" value={defaults.date} allowEmpty />
        <div>
          <label htmlFor="ev-time" className="label">
            ساعت (اختیاری)
          </label>
          <input id="ev-time" name="time" type="time" className="input" defaultValue={defaults.time ?? ""} dir="ltr" />
        </div>
        <JalaliDateInput id="ev-end" name="endDate" label="تاریخ پایان (اختیاری)" value={defaults.endDate} allowEmpty />
        <JalaliDateInput id="ev-rsvp" name="rsvpDeadline" label="مهلت پاسخ حضور (اختیاری)" value={defaults.rsvpDeadline} allowEmpty />
      </fieldset>
      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-bold">مکان</legend>
        <input name="locationName" className="input" maxLength={200} defaultValue={defaults.locationName ?? ""} placeholder="نام یا نشانی مکان" aria-label="نام مکان" />
        <input name="locationNote" className="input" maxLength={500} defaultValue={defaults.locationNote ?? ""} placeholder="توضیح دسترسی (طبقه، زنگ، پارکینگ…)" aria-label="توضیح دسترسی" />
        <input name="mapUrl" className="input" maxLength={2000} defaultValue={defaults.mapUrl ?? ""} placeholder="لینک نقشه (https://…)" aria-label="لینک نقشه" dir="ltr" />
      </fieldset>
      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-bold">بودجه تقریبی</legend>
        <p className="hint">فقط برای برنامه‌ریزی است و بدهی نمی‌سازد. بودجه هدیه سورپرایز را داخل فضای خصوصی تعیین کنید.</p>
        {(["food", "cake", "venue", "other"] as const).map((c) => (
          <AmountInput key={c} id={`budget-${c}`} name={`budget_${c}`} label={BUDGET_LABELS[c]} value={budgets[c] ?? ""} onChange={(v) => setBudgets((b) => ({ ...b, [c]: v }))} />
        ))}
      </fieldset>
      <fieldset className="card space-y-2">
        <legend className="px-1 text-sm font-bold">تعداد مهمانان قطعی (اختیاری)</legend>
        <p className="hint">اگر خالی بماند، از پاسخ‌های «می‌آیم» و همراهان محاسبه می‌شود.</p>
        <div className="grid grid-cols-2 gap-2">
          <input name="finalAdults" type="number" min={0} className="input" defaultValue={defaults.finalAdults ?? ""} placeholder="بزرگسال" aria-label="بزرگسال" />
          <input name="finalChildren" type="number" min={0} className="input" defaultValue={defaults.finalChildren ?? ""} placeholder="کودک" aria-label="کودک" />
        </div>
      </fieldset>
      <div>
        <label htmlFor="ev-desc" className="label">
          توضیح
        </label>
        <textarea id="ev-desc" name="description" className="input min-h-20 py-2" maxLength={1000} defaultValue={defaults.description ?? ""} />
      </div>
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ذخیره</SubmitButton>
    </form>
  );
}
