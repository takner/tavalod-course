"use client";

import { useActionState } from "react";
import { updateNameAction } from "@/app/actions";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

export function NameForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateNameAction, initialActionState);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="my-name" className="label">
        نام من
      </label>
      <div className="flex gap-2">
        <input id="my-name" name="name" defaultValue={name} maxLength={60} className="input" required />
        <SubmitButton className="btn-secondary shrink-0">ذخیره</SubmitButton>
      </div>
      <p className="hint">نام شما در گروه‌هایی که بعد از این می‌پیوندید استفاده می‌شود.</p>
      <ActionMessage state={state} />
    </form>
  );
}
