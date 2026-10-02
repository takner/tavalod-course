"use client";

import { useActionState, useState } from "react";
import { reserveAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { JalaliDateInput } from "@/components/inputs";
import { OnlineOnly } from "@/components/OnlineOnly";

export function ReserveForm({ groupId, listId, itemId }: { groupId: string; listId: string; itemId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(reserveAction.bind(null, groupId, listId, itemId), initialActionState);
  if (!open) {
    return (
      <button type="button" className="btn-secondary min-h-9 w-full text-xs" onClick={() => setOpen(true)}>
        من این را می‌خرم (رزرو)
      </button>
    );
  }
  return (
    <OnlineOnly>
      <form action={action} className="space-y-2">
        <JalaliDateInput id={`deadline-${itemId}`} name="deadline" label="رزرو تا (اختیاری؛ بعد از آن خودکار آزاد می‌شود)" value={null} allowEmpty />
        <input name="note" className="input" maxLength={300} placeholder="یادداشت برای بقیه (اختیاری)" aria-label="یادداشت" />
        <ActionMessage state={state} />
        <SubmitButton className="btn-primary w-full">ثبت رزرو</SubmitButton>
      </form>
    </OnlineOnly>
  );
}
