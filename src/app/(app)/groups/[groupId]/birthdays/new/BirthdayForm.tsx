"use client";

import { useActionState, useState } from "react";
import { createBirthdayAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { JalaliDateInput } from "@/components/inputs";
import { todayIso } from "@/lib/format";

export function BirthdayForm({
  groupId,
  members,
  nextDates,
  defaultMember,
}: {
  groupId: string;
  members: { id: string; name: string; isMe: boolean }[];
  nextDates: Record<string, string>;
  defaultMember: string | null;
}) {
  const others = members.filter((m) => !m.isMe);
  const first = defaultMember && members.some((m) => m.id === defaultMember) ? defaultMember : (others[0]?.id ?? members[0]?.id ?? "");
  const [celebrant, setCelebrant] = useState(first);
  const [state, action] = useActionState(createBirthdayAction.bind(null, groupId), initialActionState);
  const isMe = members.find((m) => m.id === celebrant)?.isMe ?? false;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="bd-celebrant" className="label">
          تولد چه کسی؟
        </label>
        <select id="bd-celebrant" name="celebrant" className="input" value={celebrant} onChange={(e) => setCelebrant(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.isMe ? " (خودم)" : ""}
            </option>
          ))}
        </select>
      </div>
      <JalaliDateInput key={celebrant} id="bd-date" name="date" label="تاریخ جشن" value={nextDates[celebrant] ?? todayIso()} />
      {nextDates[celebrant] && <p className="hint -mt-2">پیشنهاد بر اساس تاریخ تولدی که خود او ثبت کرده است.</p>}
      <div>
        <label htmlFor="bd-time" className="label">
          ساعت (اختیاری، به وقت تهران)
        </label>
        <input id="bd-time" name="time" type="time" className="input" dir="ltr" />
      </div>
      <div>
        <label htmlFor="bd-title" className="label">
          عنوان (اختیاری)
        </label>
        <input id="bd-title" name="title" className="input" maxLength={120} placeholder={`تولد ${members.find((m) => m.id === celebrant)?.name ?? ""}`} />
      </div>
      <label className="flex items-start gap-2 text-sm leading-6">
        <input type="checkbox" name="createSurprise" defaultChecked={!isMe} disabled={isMe} />
        <span>
          ساخت فضای خصوصی سورپرایز برای هدیه گروهی
          <span className="block text-xs text-muted">همه اعضای گروه به جز صاحب تولد؛ او هیچ چیزی از این فضا نمی‌بیند.</span>
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="addChecklist" defaultChecked />
        چک‌لیست پیش‌فرض (کیک، محل، غذا، هدیه)
      </label>
      <p className="rounded-xl bg-surface-2 p-3 text-xs leading-6 text-muted">
        همه اعضا به رویداد دعوت می‌شوند. دعوت، پاسخ حضور یا رأی دادن هیچ بدهی‌ای ایجاد نمی‌کند؛ فقط هزینه قطعی‌ای که ثبت شود.
      </p>
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ساخت تولد</SubmitButton>
    </form>
  );
}
