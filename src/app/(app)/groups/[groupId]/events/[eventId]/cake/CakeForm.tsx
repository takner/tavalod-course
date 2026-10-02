"use client";

import { useActionState } from "react";
import { cakeAction } from "@/app/actions-phase2";
import { ActionMessage, initialActionState, SubmitButton } from "@/components/forms";

export function CakeForm({
  groupId,
  eventId,
  defaults,
}: {
  groupId: string;
  eventId: string;
  defaults: { adultGrams: number; childGrams: number; marginPercent: number; roundStepGrams: number; orderGrams: number | null };
}) {
  const [state, action] = useActionState(cakeAction.bind(null, groupId, eventId), initialActionState);
  const field = (name: string, label: string, value: number | null | string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-sm">
      {label}
      <input name={name} type="number" min={0} defaultValue={value ?? ""} className="input mt-1" {...extra} />
    </label>
  );
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-bold">فرض‌های محاسبه</h2>
      <div className="grid grid-cols-2 gap-3">
        {field("adultGrams", "سهم بزرگسال (گرم)", defaults.adultGrams)}
        {field("childGrams", "سهم کودک (گرم)", defaults.childGrams)}
        {field("marginPercent", "حاشیه اضافه (٪)", defaults.marginPercent, { step: "0.5" })}
        {field("roundStepGrams", "گام گردکردن (گرم)", defaults.roundStepGrams, { step: 50, min: 50 })}
      </div>
      {field("orderGrams", "مقدار نهایی سفارش (گرم، اختیاری)", defaults.orderGrams, { placeholder: "مثلاً ۲۰۰۰" })}
      <ActionMessage state={state} />
      <SubmitButton className="btn-primary w-full">ذخیره</SubmitButton>
    </form>
  );
}
