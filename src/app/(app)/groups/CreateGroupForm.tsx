"use client";

import { useActionState } from "react";
import { createGroupAction } from "@/app/actions";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

export function CreateGroupForm() {
  const [state, action] = useActionState(createGroupAction, initialActionState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="group-name" className="sr-only">
        نام گروه
      </label>
      <input id="group-name" name="name" className="input" placeholder="مثلاً دوستان دانشگاه" maxLength={60} required />
      <ActionMessage state={state} />
      <SubmitButton>ساخت گروه</SubmitButton>
    </form>
  );
}
