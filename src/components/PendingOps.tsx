"use client";

import { formatJalaliDateTime } from "@/lib/format";
import { useSync } from "./SyncProvider";

/** Items created on this device that the server has not accepted yet. */
export function PendingOps({ groupId }: { groupId?: string }) {
  const { pending, online, discard, flush } = useSync();
  const items = groupId ? pending.filter((p) => p.groupId === groupId) : pending;
  if (items.length === 0) return null;
  return (
    <section className="card border-warning/40 bg-warning-soft" data-testid="pending-ops">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-warning">در انتظار همگام‌سازی</h2>
        <button type="button" className="btn-ghost min-h-8 px-2 text-xs" onClick={() => void flush()}>
          {online ? "ارسال دوباره" : "منتظر اینترنت…"}
        </button>
      </div>
      <ul className="space-y-2">
        {items.map((op) => (
          <li key={op.clientKey} className="rounded-xl bg-surface p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span>{op.label}</span>
              <span className="shrink-0 text-xs text-muted">{formatJalaliDateTime(new Date(op.createdAt))}</span>
            </div>
            {op.error ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-negative">ثبت نشد: {op.error.message}</span>
                <button type="button" className="btn-danger min-h-8 px-2 text-xs" onClick={() => void discard(op.clientKey)}>
                  حذف از صف
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">روی همین دستگاه ذخیره شده و بعد از اتصال ارسال می‌شود.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
