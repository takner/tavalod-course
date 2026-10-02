"use client";

import { useActionState, useRef } from "react";
import { addSpaceMembersAction, postMessageAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

export function MessageForm({ groupId, spaceId }: { groupId: string; spaceId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (prev: typeof initialActionState, fd: FormData) => {
    const r = await postMessageAction(groupId, spaceId, prev, fd);
    if (r.ok) ref.current?.reset();
    return r;
  }, initialActionState);
  return (
    <form ref={ref} action={action} className="flex gap-2">
      <input name="body" className="input" maxLength={1000} placeholder="پیام…" aria-label="پیام" required />
      <SubmitButton className="btn-primary shrink-0">ارسال</SubmitButton>
      {state.error && <ActionMessage state={state} />}
    </form>
  );
}

export function AddMembersForm({ groupId, spaceId, candidates }: { groupId: string; spaceId: string; candidates: { id: string; name: string }[] }) {
  const [state, action] = useActionState(addSpaceMembersAction.bind(null, groupId, spaceId), initialActionState);
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm text-primary">+ افزودن عضو</summary>
      <form action={action} className="mt-2 space-y-1">
        {candidates.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="members" value={m.id} />
            {m.name}
          </label>
        ))}
        <ActionMessage state={state} />
        <SubmitButton className="btn-secondary w-full">افزودن</SubmitButton>
      </form>
    </details>
  );
}
