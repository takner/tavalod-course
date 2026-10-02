"use client";

import { useActionState, useState } from "react";
import { updateBirthdayAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { JALALI_MONTHS } from "@/lib/format";

const GREGORIAN_MONTHS = ["ژانویه", "فوریه", "مارس", "آوریل", "مه", "ژوئن", "ژوئیه", "اوت", "سپتامبر", "اکتبر", "نوامبر", "دسامبر"];

export function BirthdayForm({ current }: { current: { calendar: string; month: number; day: number; year: number | null } | null }) {
  const [state, action] = useActionState(updateBirthdayAction, initialActionState);
  const [calendar, setCalendar] = useState(current?.calendar ?? "jalali");
  const months = calendar === "jalali" ? JALALI_MONTHS : GREGORIAN_MONTHS;
  return (
    <form action={action} className="space-y-2">
      <p className="label">تاریخ تولد من</p>
      <p className="hint -mt-1">برای یادآوری تولد به اعضای گروه‌هایتان. سال اختیاری است و فقط برای نمایش سن به کار می‌رود.</p>
      <div className="grid grid-cols-2 gap-2">
        <select name="calendar" className="input" value={calendar} onChange={(e) => setCalendar(e.target.value)} aria-label="تقویم">
          <option value="jalali">شمسی</option>
          <option value="gregorian">میلادی</option>
        </select>
        <select name="month" className="input" defaultValue={current?.month ?? 1} aria-label="ماه" key={calendar}>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input name="day" type="number" min={1} max={31} className="input" defaultValue={current?.day ?? ""} placeholder="روز" aria-label="روز" required />
        <input name="year" type="number" className="input" defaultValue={current?.year ?? ""} placeholder={calendar === "jalali" ? "سال (اختیاری)، مثلاً ۱۳۷۵" : "سال (اختیاری)"} aria-label="سال" />
      </div>
      <ActionMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton className="btn-secondary flex-1">ذخیره تاریخ تولد</SubmitButton>
        {current && (
          <button name="clear" value="1" className="btn-ghost" formNoValidate>
            حذف
          </button>
        )}
      </div>
    </form>
  );
}
