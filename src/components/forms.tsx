"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";
import { Notice } from "./ui";

export const initialActionState: ActionState = { ok: false };

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "در حال ارسال…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

export function ActionMessage({ state }: { state: ActionState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.ok && state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * A single-button form bound to a server action (confirm / reject / delete / close…), with an
 * optional confirmation prompt and inline error display.
 */
export function ActionButton({
  action,
  children,
  className = "btn-secondary",
  confirmText,
  pendingText,
}: {
  action: (prev: ActionState) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  confirmText?: string;
  pendingText?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="contents"
    >
      <SubmitButton className={className} pendingText={pendingText}>
        {children}
      </SubmitButton>
      {state.error && (
        <div className="basis-full">
          <Notice tone="error">{state.error}</Notice>
        </div>
      )}
    </form>
  );
}

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2">
      <input readOnly value={link} dir="ltr" className="input min-h-9 text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-secondary min-h-9 shrink-0 px-3 text-xs"
        onClick={async () => {
          try {
            if (navigator.share) {
              await navigator.share({ url: link });
            } else {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }
          } catch {
            /* user cancelled share */
          }
        }}
      >
        {copied ? "کپی شد" : "اشتراک"}
      </button>
    </div>
  );
}
