"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions";
import { deleteAccountQueue, listQueued } from "@/lib/offline/queue";

/** Signs out and removes this account's offline data from the device. */
export function LogoutButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-secondary w-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const queued = await listQueued(userId).catch(() => []);
          if (
            queued.length > 0 &&
            !window.confirm(`${queued.length} مورد هنوز ارسال نشده و با خروج از حساب از این دستگاه پاک می‌شود. ادامه می‌دهید؟`)
          ) {
            return;
          }
          await deleteAccountQueue(userId);
          await logoutAction();
        })
      }
    >
      {pending ? "در حال خروج…" : "خروج از حساب"}
    </button>
  );
}
