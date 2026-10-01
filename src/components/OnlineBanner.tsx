"use client";

import { useSync } from "./SyncProvider";

export function OnlineBanner() {
  const { online, pending } = useSync();
  const waiting = pending.filter((p) => !p.error).length;
  if (online && waiting === 0) return null;
  return (
    <div role="status" className="sticky top-0 z-30 bg-warning-soft px-4 py-2 text-center text-xs text-warning">
      {online ? `${new Intl.NumberFormat("fa-IR").format(waiting)} مورد در انتظار همگام‌سازی` : "آفلاین هستید — هزینه‌های جدید روی همین دستگاه نگه داشته می‌شوند."}
    </div>
  );
}
