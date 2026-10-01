"use client";

import { useActionState } from "react";
import { requestLoginAction } from "@/app/actions";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

export function LoginForm({ next }: { next: string | null }) {
  const [state, action] = useActionState(requestLoginAction, initialActionState);
  if (state.ok) {
    return (
      <div className="space-y-3">
        <ActionMessage state={state} />
        <p className="text-sm leading-7 text-muted">لینک فقط ۱۵ دقیقه و یک بار معتبر است. می‌توانید این صفحه را ببندید.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">
          ایمیل
        </label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          className="input text-left"
          placeholder="you@example.com"
        />
      </div>
      {next && <input type="hidden" name="next" value={next} />}
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ارسال لینک ورود</SubmitButton>
    </form>
  );
}
