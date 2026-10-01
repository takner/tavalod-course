"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/actions";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

export function AcceptInvite({ token, label }: { token: string; label: string }) {
  const [state, action] = useActionState(acceptInviteAction.bind(null, token), initialActionState);
  return (
    <form action={action} className="space-y-3">
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">{label}</SubmitButton>
    </form>
  );
}
