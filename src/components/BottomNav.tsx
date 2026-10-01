"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, HomeIcon, UserIcon } from "./icons";

const items = [
  { href: "/groups", label: "خانه", Icon: HomeIcon },
  { href: "/notifications", label: "اعلان‌ها", Icon: BellIcon },
  { href: "/me", label: "حساب من", Icon: UserIcon },
];

/** Shopping-app style tab bar: outline icons, the active tab dark, bold and filled. */
export function BottomNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-3">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] ${active ? "font-bold text-text" : "text-muted"}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={24} filled={active} />
                {label}
                {href === "/notifications" && unread > 0 && (
                  <span className="absolute top-1.5 left-1/2 -translate-x-4 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-bold text-white">
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
