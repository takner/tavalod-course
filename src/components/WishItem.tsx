import { formatToman } from "@/domain/money";
import { formatJalaliDate } from "@/lib/format";
import { PRICE_SOURCE_LABELS } from "@/server/prices/providers";
import { Chip } from "./ui";

export const ITEM_KIND_LABELS: Record<string, string> = {
  product: "کالا",
  digital: "کالای دیجیتال / کتاب الکترونیک",
  ticket: "بلیت",
  experience: "تجربه / تفریح",
  other: "سایر",
};
export const PRIORITY_LABELS: Record<number, string> = { 1: "اولویت بالا", 2: "اولویت متوسط", 3: "اولویت کم" };
export const ITEM_STATUS_LABELS: Record<string, string> = { wanted: "هنوز می‌خواهم", received: "دریافت کرده‌ام", not_wanted: "دیگر نمی‌خواهم" };

export interface WishItemData {
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
  price: { amount: bigint; observedAt: Date; source: string } | null;
}

/** Read-only presentation of a wishlist item (no reservation data — callers add that separately). */
export function WishItem({ item, imageQuery = "", children }: { item: WishItemData; imageQuery?: string; children?: React.ReactNode }) {
  const details = [item.brand, item.model, item.color && `رنگ: ${item.color}`, item.size && `سایز: ${item.size}`].filter(Boolean);
  return (
    <article className="card space-y-2">
      <div className="flex gap-3">
        {item.imageFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${item.imageFileId}${imageQuery}`} alt="" className="size-20 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl" aria-hidden>
            🎁
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-7">{item.title}</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip tone={item.priority === 1 ? "primary" : "neutral"}>{PRIORITY_LABELS[item.priority]}</Chip>
            <Chip>{ITEM_KIND_LABELS[item.kind]}</Chip>
            {item.status !== "wanted" && <Chip tone="warning">{ITEM_STATUS_LABELS[item.status]}</Chip>}
            {item.acceptsSubstitute && <Chip tone="positive">مشابه هم قبول است</Chip>}
          </div>
        </div>
      </div>
      {details.length > 0 && <p className="text-sm text-muted">{details.join(" · ")}</p>}
      {item.specs && <p className="text-sm leading-7">{item.specs}</p>}
      {item.description && <p className="text-sm leading-7 text-muted">{item.description}</p>}
      {item.price && (
        <p className="text-sm">
          قیمت دیده‌شده: <strong className="tabular">{formatToman(item.price.amount)}</strong>
          <span className="text-xs text-muted">
            {" "}
            — {PRICE_SOURCE_LABELS[item.price.source] ?? item.price.source}، {formatJalaliDate(item.price.observedAt)} (قیمت ممکن است تغییر کرده باشد)
          </span>
        </p>
      )}
      {item.productUrl && (
        <a href={item.productUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-block text-sm text-primary underline" dir="ltr">
          {new URL(item.productUrl).hostname}
        </a>
      )}
      {children}
    </article>
  );
}
