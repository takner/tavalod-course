import Link from "next/link";
import { BellIcon } from "./icons";

/** White sticky top bar: brand pill (links home) and the notifications bell. */
export function AppHeader({ unread }: { unread: number }) {
  return (
    <header className="sticky top-0 z-20 bg-surface shadow-[0_1px_0_var(--border)]">
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
        <Link
          href="/groups"
          className="flex min-h-11 flex-1 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm text-muted"
          aria-label="خانه"
        >
          <span className="text-lg font-black tracking-tight text-primary">تولد</span>
          <span className="truncate">· جمع دوستان، از برنامه تا تسویه</span>
        </Link>
        <Link
          href="/notifications"
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-text"
          aria-label={unread > 0 ? `اعلان‌ها (${unread} خوانده‌نشده)` : "اعلان‌ها"}
        >
          <BellIcon size={22} />
          {unread > 0 && <span className="absolute top-2 right-2.5 size-2.5 rounded-full bg-primary ring-2 ring-surface" />}
        </Link>
      </div>
    </header>
  );
}
