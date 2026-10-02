"use client";

import { useActionState } from "react";
import { createTaskAction, deleteTaskAction, toggleTaskAction } from "@/app/actions-phase2";
import { ActionButton, ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { JalaliDateInput } from "@/components/inputs";
import { formatJalaliDate } from "@/lib/format";

export interface TaskRow {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  assignee: string | null;
}

export function TaskList({
  groupId,
  eventId,
  spaceId,
  tasks,
  members,
}: {
  groupId: string;
  eventId: string;
  spaceId: string | null;
  tasks: TaskRow[];
  members: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createTaskAction.bind(null, groupId, eventId, spaceId), initialActionState);
  return (
    <div className="space-y-3">
      {tasks.length === 0 && <p className="text-sm text-muted">کاری ثبت نشده است.</p>}
      <ul className="divide-y divide-border">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
            <ActionButton action={toggleTaskAction.bind(null, groupId, t.id, !t.done)} className={`size-6 shrink-0 rounded-md border ${t.done ? "border-positive bg-positive text-white" : "border-border"}`}>
              <span className="sr-only">{t.done ? "برگرداندن به انجام‌نشده" : "علامت انجام شد"}</span>
              {t.done ? "✓" : ""}
            </ActionButton>
            <span className={`min-w-0 flex-1 ${t.done ? "text-muted line-through" : ""}`}>
              {t.title}
              <span className="block text-xs text-muted">
                {t.assignee ? `مسئول: ${t.assignee}` : "بدون مسئول"}
                {t.dueDate && ` · موعد ${formatJalaliDate(t.dueDate)}`}
              </span>
            </span>
            <ActionButton action={deleteTaskAction.bind(null, groupId, t.id)} className="text-xs text-muted" confirmText="این کار حذف شود؟">
              حذف
            </ActionButton>
          </li>
        ))}
      </ul>
      <details className="rounded-xl bg-surface-2 p-3">
        <summary className="cursor-pointer text-sm font-medium text-primary">+ افزودن کار</summary>
        <form action={action} className="mt-3 space-y-2">
          <input name="title" className="input" maxLength={160} placeholder="مثلاً خرید کیک" aria-label="عنوان کار" required />
          <select name="assignee" className="input" aria-label="مسئول" defaultValue="">
            <option value="">بدون مسئول</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <JalaliDateInput id={`due-${spaceId ?? "pub"}`} name="dueDate" label="موعد (اختیاری)" value={null} allowEmpty />
          <ActionMessage state={state} />
          <SubmitButton className="btn-secondary w-full">افزودن</SubmitButton>
        </form>
      </details>
    </div>
  );
}
