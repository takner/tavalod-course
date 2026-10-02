"use client";

import { useActionState, useState } from "react";
import { rsvpAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

const STATUSES = [
  { value: "going", label: "می‌آیم" },
  { value: "maybe", label: "شاید" },
  { value: "declined", label: "نمی‌آیم" },
];

export function RsvpForm({
  groupId,
  eventId,
  current,
  guests,
}: {
  groupId: string;
  eventId: string;
  current: { status: string; adults: number; children: number } | null;
  guests: { id: string; name: string }[];
}) {
  const [forMember, setForMember] = useState<string>("");
  const [state, action] = useActionState(rsvpAction.bind(null, groupId, eventId, forMember || null), initialActionState);
  const [status, setStatus] = useState(current && current.status !== "invited" ? current.status : "going");
  return (
    <form action={action} className="space-y-3 rounded-xl bg-surface-2 p-3">
      {guests.length > 0 && (
        <select className="input min-h-9 text-sm" aria-label="پاسخ برای" value={forMember} onChange={(e) => setForMember(e.target.value)}>
          <option value="">پاسخ خودم</option>
          {guests.map((g) => (
            <option key={g.id} value={g.id}>
              از طرف مهمان: {g.name}
            </option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1" role="radiogroup" aria-label="وضعیت حضور">
        {STATUSES.map((s) => (
          <label key={s.value} className={`cursor-pointer rounded-lg py-2 text-center text-sm ${status === s.value ? "bg-primary text-white" : "text-muted"}`}>
            <input type="radio" name="status" value={s.value} checked={status === s.value} onChange={() => setStatus(s.value)} className="sr-only" />
            {s.label}
          </label>
        ))}
      </div>
      {status !== "declined" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            بزرگسال همراه
            <input name="adultCompanions" type="number" min={0} max={50} defaultValue={forMember ? 0 : (current?.adults ?? 0)} className="input mt-1 min-h-9" />
          </label>
          <label className="text-xs">
            کودک همراه
            <input name="childCompanions" type="number" min={0} max={50} defaultValue={forMember ? 0 : (current?.children ?? 0)} className="input mt-1 min-h-9" />
          </label>
        </div>
      )}
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">{current && current.status !== "invited" && !forMember ? "به‌روزرسانی پاسخ" : "ثبت پاسخ"}</SubmitButton>
    </form>
  );
}
