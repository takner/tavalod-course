"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";
import { ActionMessage, CopyLink, initialActionState, SubmitButton } from "@/components/forms";

export function ShareLinkButton({ action, label }: { action: (prev: ActionState) => Promise<ActionState>; label: string }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton className="btn-secondary w-full">{label}</SubmitButton>
      {state.link && <CopyLink link={state.link} />}
      <ActionMessage state={state} />
    </form>
  );
}
