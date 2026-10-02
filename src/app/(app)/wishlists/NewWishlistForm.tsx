"use client";

import { useActionState } from "react";
import { createWishlistAction, updateWishlistAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

function Fields({ groups, title, description, selected }: { groups: { id: string; name: string }[]; title?: string; description?: string | null; selected?: string[] }) {
  return (
    <>
      <div>
        <label htmlFor="wl-title" className="label">
          عنوان
        </label>
        <input id="wl-title" name="title" className="input" maxLength={80} defaultValue={title} placeholder="مثلاً هدیه‌های تولدم" required />
      </div>
      <div>
        <label htmlFor="wl-desc" className="label">
          توضیح (اختیاری)
        </label>
        <input id="wl-desc" name="description" className="input" maxLength={500} defaultValue={description ?? ""} />
      </div>
      <fieldset>
        <legend className="label">چه کسانی ببینند؟</legend>
        <p className="hint mb-2">اگر هیچ گروهی انتخاب نشود، فهرست فقط برای خودتان است. رزروها و خریدهای دیگران هیچ‌وقت به شما نشان داده نمی‌شود.</p>
        {groups.length === 0 && <p className="text-xs text-muted">هنوز عضو گروهی نیستید.</p>}
        {groups.map((g) => (
          <label key={g.id} className="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" name="groupIds" value={g.id} defaultChecked={selected?.includes(g.id)} />
            اعضای «{g.name}»
          </label>
        ))}
      </fieldset>
    </>
  );
}

export function NewWishlistForm({ groups }: { groups: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createWishlistAction, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <Fields groups={groups} />
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ساخت فهرست</SubmitButton>
    </form>
  );
}

export function EditWishlistForm({
  wishlistId,
  groups,
  title,
  description,
  selected,
}: {
  wishlistId: string;
  groups: { id: string; name: string }[];
  title: string;
  description: string | null;
  selected: string[];
}) {
  const [state, action] = useActionState(updateWishlistAction.bind(null, wishlistId), initialActionState);
  return (
    <form action={action} className="space-y-3">
      <Fields groups={groups} title={title} description={description} selected={selected} />
      <ActionMessage state={state} />
      <SubmitButton className="btn-secondary w-full">ذخیره تنظیمات</SubmitButton>
    </form>
  );
}
