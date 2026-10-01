"use client";

import { useActionState } from "react";
import { setParticipantsAction } from "@/app/actions";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

export function ParticipantsForm({
  groupId,
  eventId,
  members,
  selected,
}: {
  groupId: string;
  eventId: string;
  members: { id: string; name: string }[];
  selected: string[];
}) {
  const [state, action] = useActionState(setParticipantsAction.bind(null, groupId, eventId), initialActionState);
  return (
    <details className="card">
      <summary className="cursor-pointer font-bold">
        شرکت‌کنندگان ({new Intl.NumberFormat("fa-IR").format(selected.length)})
      </summary>
      <form action={action} className="mt-3 space-y-2">
        <p className="text-xs leading-6 text-muted">شرکت در رویداد کسی را بدهکار نمی‌کند.</p>
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" name="participants" value={m.id} defaultChecked={selected.includes(m.id)} />
            {m.name}
          </label>
        ))}
        <ActionMessage state={state} />
        <SubmitButton className="btn-secondary w-full">ذخیره</SubmitButton>
      </form>
    </details>
  );
}
