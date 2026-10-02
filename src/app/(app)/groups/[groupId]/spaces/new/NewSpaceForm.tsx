"use client";

import { useActionState } from "react";
import { createSpaceAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

export function NewSpaceForm({
  groupId,
  eventId,
  defaultTitle,
  candidates,
  celebrantName,
}: {
  groupId: string;
  eventId: string;
  defaultTitle: string;
  candidates: { id: string; name: string }[];
  celebrantName: string | null;
}) {
  const [state, action] = useActionState(createSpaceAction.bind(null, groupId, eventId), initialActionState);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="sp-title" className="label">
          عنوان
        </label>
        <input id="sp-title" name="title" className="input" defaultValue={defaultTitle} maxLength={120} required />
      </div>
      <fieldset className="card">
        <legend className="px-1 text-sm font-bold">اعضای فضا</legend>
        <p className="hint mb-2">
          شما خودکار عضو هستید.{celebrantName && ` ${celebrantName} (صاحب تولد) هرگز نمی‌تواند عضو شود.`} فقط اعضا هدیه، قیمت، مشارکت‌ها، گفت‌وگو و رسید را می‌بینند.
        </p>
        {candidates.map((m) => (
          <label key={m.id} className="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" name="members" value={m.id} defaultChecked />
            {m.name}
          </label>
        ))}
      </fieldset>
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ساخت فضا</SubmitButton>
    </form>
  );
}
