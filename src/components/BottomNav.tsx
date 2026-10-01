"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/groups", label: "گروه‌ها", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/me", label: "حساب من", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" },
  { href: "/notifications", label: "اعلان‌ها", icon: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4" },
];

export function BottomNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-3">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "text-primary" : "text-muted"}`}
                aria-current={active ? "page" : undefined}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={it.icon} />
                </svg>
                {it.label}
                {it.href === "/notifications" && unread > 0 && (
                  <span className="absolute top-1 right-1/2 translate-x-5 rounded-full bg-negative px-1.5 text-[10px] leading-4 text-white">
                    {new Intl.NumberFormat("fa-IR").format(unread)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
