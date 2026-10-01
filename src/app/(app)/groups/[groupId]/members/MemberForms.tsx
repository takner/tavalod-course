"use client";

import { useActionState, useState } from "react";
import { addGuestAction, createClaimInviteAction, createGroupInviteAction, renameMemberAction } from "@/app/actions";
import { ActionMessage, CopyLink, initialActionState, SubmitButton } from "@/components/forms";

export function AddGuestForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(addGuestAction.bind(null, groupId), initialActionState);
  return (
    <form action={action} className="flex flex-col gap-2" key={state.ok ? state.message : "form"}>
      <label htmlFor="guest-name" className="sr-only">
        نام عضو مهمان
      </label>
      <input id="guest-name" name="name" className="input" placeholder="نام" maxLength={60} required />
      <ActionMessage state={state} />
      <SubmitButton className="btn-secondary">افزودن</SubmitButton>
    </form>
  );
}

export function GroupInviteForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(createGroupInviteAction.bind(null, groupId), initialActionState);
  return (
    <form action={action}>
      <SubmitButton className="btn-secondary w-full">ساخت لینک دعوت</SubmitButton>
      {state.link && <CopyLink link={state.link} />}
      <div className="mt-2">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function ClaimInviteForm({ groupId, memberId, name }: { groupId: string; memberId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createClaimInviteAction.bind(null, groupId, memberId), initialActionState);
  if (!open) {
    return (
      <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => setOpen(true)}>
        لینک اختصاصی اتصال حساب برای {name}
      </button>
    );
  }
  return (
    <form action={action} className="space-y-2 rounded-xl bg-surface-2 p-3">
      <label htmlFor={`claim-email-${memberId}`} className="label text-xs">
        ایمیل {name} (اختیاری؛ اگر وارد شود، فقط همین ایمیل می‌تواند از لینک استفاده کند)
      </label>
      <input id={`claim-email-${memberId}`} name="email" type="email" dir="ltr" className="input text-left" />
      <SubmitButton className="btn-secondary w-full">ساخت لینک یک‌بارمصرف</SubmitButton>
      {state.link && <CopyLink link={state.link} />}
      <ActionMessage state={state} />
    </form>
  );
}

export function RenameForm({ groupId, memberId, name }: { groupId: string; memberId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(renameMemberAction.bind(null, groupId, memberId), initialActionState);
  if (!open) {
    return (
      <button type="button" className="text-xs text-muted underline" onClick={() => setOpen(true)}>
        تغییر نام
      </button>
    );
  }
  return (
    <form action={action} className="flex gap-2">
      <input name="name" defaultValue={name} className="input min-h-9" maxLength={60} aria-label="نام جدید" required />
      <SubmitButton className="btn-secondary min-h-9 shrink-0 px-3 text-xs">ذخیره</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
