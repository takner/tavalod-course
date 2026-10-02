"use client";

import { useActionState, useState } from "react";
import { deleteItemAction, saveItemAction } from "@/app/actions-phase2";
import { ActionButton, ActionMessage, initialActionState, SubmitButton } from "@/components/forms";
import { ImagePicker } from "@/components/ImagePicker";
import { AmountInput, JalaliDateInput } from "@/components/inputs";
import { ITEM_KIND_LABELS, ITEM_STATUS_LABELS, PRIORITY_LABELS } from "@/components/WishItem";
import { todayIso } from "@/lib/format";

export interface ItemDefaults {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  specs: string | null;
  productUrl: string | null;
  priority: number;
  status: string;
  acceptsSubstitute: boolean;
  imageFileId: string | null;
}

const text = (name: string, label: string, def: string | null | undefined, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
  <div>
    <label htmlFor={`it-${name}`} className="label">
      {label}
    </label>
    <input id={`it-${name}`} name={name} defaultValue={def ?? ""} className="input" {...props} />
  </div>
);

export function ItemForm({ wishlistId, item }: { wishlistId: string; item?: ItemDefaults }) {
  const [state, action] = useActionState(saveItemAction.bind(null, wishlistId, item?.id ?? null), initialActionState);
  const [kind, setKind] = useState(item?.kind ?? "product");
  const [price, setPrice] = useState("");
  const physical = kind === "product";
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="it-kind" className="label">
            نوع
          </label>
          <select id="it-kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(ITEM_KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {text("title", "عنوان", item?.title, { required: true, maxLength: 120, placeholder: "مثلاً هدفون بی‌سیم" })}
        <ImagePicker name="image" label="تصویر (اختیاری)" currentUrl={item?.imageFileId ? `/api/files/${item.imageFileId}` : null} />
        {item?.imageFileId && <input type="hidden" name="keepImageId" value={item.imageFileId} />}
        {physical && (
          <div className="grid grid-cols-2 gap-3">
            {text("brand", "برند", item?.brand, { maxLength: 80 })}
            {text("model", "مدل دقیق", item?.model, { maxLength: 120 })}
            {text("color", "رنگ", item?.color, { maxLength: 60 })}
            {text("size", "سایز", item?.size, { maxLength: 60 })}
          </div>
        )}
        {text("specs", physical ? "مشخصات مهم" : "جزئیات (مثلاً نام کتاب، تاریخ یا نوع بلیت)", item?.specs, { maxLength: 500 })}
        <div>
          <label htmlFor="it-description" className="label">
            توضیح
          </label>
          <textarea id="it-description" name="description" defaultValue={item?.description ?? ""} maxLength={1000} className="input min-h-20 py-2" />
        </div>
        {text("productUrl", "لینک کالا یا فروشگاه", item?.productUrl, { dir: "ltr", inputMode: "url", placeholder: "https://…" })}

        <fieldset className="rounded-xl bg-surface-2 p-3">
          <legend className="px-1 text-sm font-bold">قیمت دیده‌شده (اختیاری)</legend>
          <p className="hint mb-2">قیمتی که خودتان دیده‌اید؛ همراه با تاریخ و منبع ذخیره می‌شود. دریافت خودکار قیمت هنوز فعال نیست.</p>
          <AmountInput id="it-price" name="price" value={price} onChange={setPrice} />
          <div className="mt-2 grid grid-cols-1 gap-2">
            <JalaliDateInput id="it-price-date" name="priceObservedOn" label="تاریخ دیدن قیمت" value={todayIso()} />
            <select name="priceSource" className="input" aria-label="منبع قیمت" defaultValue="store_page">
              <option value="store_page">صفحه فروشگاه (دیده‌شده توسط من)</option>
              <option value="manual">ثبت دستی / تخمینی</option>
            </select>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="it-priority" className="label">
              اولویت
            </label>
            <select id="it-priority" name="priority" className="input" defaultValue={String(item?.priority ?? 2)}>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="it-status" className="label">
              وضعیت
            </label>
            <select id="it-status" name="status" className="input" defaultValue={item?.status ?? "wanted"}>
              {Object.entries(ITEM_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="acceptsSubstitute" defaultChecked={item?.acceptsSubstitute} />
          کالای مشابه (برند یا مدل دیگر) هم قبول است
        </label>
        <ActionMessage state={state} />
        <SubmitButton className="btn-primary w-full">{item ? "ذخیره تغییرات" : "افزودن به فهرست"}</SubmitButton>
      </form>
      {item && (
        <ActionButton action={deleteItemAction.bind(null, wishlistId, item.id)} className="btn-danger w-full" confirmText="این آیتم از فهرست حذف شود؟">
          حذف آیتم
        </ActionButton>
      )}
    </div>
  );
}
