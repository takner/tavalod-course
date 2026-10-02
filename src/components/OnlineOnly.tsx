"use client";

import { useSync } from "./SyncProvider";

/**
 * Wraps actions that must be done online (reservations, confirming money, voting): offline they
 * are disabled with a clear reason instead of being queued with uncertain results.
 */
export function OnlineOnly({ children }: { children: React.ReactNode }) {
  const { online } = useSync();
  return (
    <fieldset disabled={!online} className="contents">
      {!online && (
        <p role="status" className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          این کار به اینترنت نیاز دارد تا از رزرو یا ثبت تکراری جلوگیری شود. بعد از اتصال دوباره امتحان کنید.
        </p>
      )}
      {children}
    </fieldset>
  );
}
