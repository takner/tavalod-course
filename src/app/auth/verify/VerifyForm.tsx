"use client";

import { useActionState } from "react";
import { verifyLoginAction } from "@/app/actions";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

/** The token is consumed only by this explicit POST, never by merely opening the link. */
export function VerifyForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyLoginAction, initialActionState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="در حال ورود…">
        ورود به حساب
      </SubmitButton>
      {state.error && (
        <a href="/login" className="btn-secondary w-full">
          درخواست لینک جدید
        </a>
      )}
    </form>
  );
}
