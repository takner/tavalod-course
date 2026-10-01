import type { Metadata } from "next";
import Link from "next/link";
import { BellIcon, ChevronLeftIcon, ScaleIcon, UsersIcon, WalletIcon } from "@/components/icons";
import { PendingOps } from "@/components/PendingOps";
import { Shortcut } from "@/components/Shortcut";
import { Balance, balanceHint, EmptyState } from "@/components/ui";
import { formatToman } from "@/domain/money";
import { requireUser } from "@/lib/session";
import { getMyAccount, unreadNotificationCount } from "@/server/queries";
import { CreateGroupForm } from "./CreateGroupForm";

export const metadata: Metadata = { title: "خانه" };

const fa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);
const AVATAR_COLORS = ["bg-[#f57c00]", "bg-[#00897b]", "bg-[#5c6bc0]", "bg-[#8d6e63]", "bg-[#d81b60]", "bg-[#3a3a3a]"];

export default async function HomePage() {
  const user = await requireUser();
  const actor = { userId: user.id };
  const [account, unread] = await Promise.all([getMyAccount(actor), unreadNotificationCount(actor)]);
  const toConfirm = account.pendingIncoming.length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        سلام <span className="font-bold text-text">{user.name}</span> 👋
      </p>

      {/* Banner carousel */}
      <section aria-label="خلاصه" className="snap-row -mx-4 px-4 pb-1">
        <div className="relative w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl bg-gradient-to-l from-[#ef4056] to-[#ff7a59] p-5 text-white">
          <span className="absolute -top-8 -left-8 size-32 rounded-full bg-white/15" aria-hidden />
          <span className="absolute -bottom-10 left-16 size-24 rounded-full bg-white/10" aria-hidden />
          <p className="text-sm text-white/85">دفتر حساب من</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-white/80">طلب من</p>
              <p className="text-lg font-black tabular">{formatToman(account.owedToMe)}</p>
            </div>
            <div>
              <p className="text-xs text-white/80">بدهی من</p>
              <p className="text-lg font-black tabular">{formatToman(account.iOwe)}</p>
            </div>
          </div>
          <Link href="/me" className="mt-4 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs">
            جزئیات <ChevronLeftIcon size={14} />
          </Link>
        </div>
        <div className="relative w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl bg-gradient-to-l from-[#00897b] to-[#26c6a6] p-5 text-white">
          <span className="absolute -top-6 -left-6 size-28 rounded-full bg-white/15" aria-hidden />
          <p className="text-lg font-black">سفر بعدی؟</p>
          <p className="mt-2 text-sm leading-7 text-white/90">
            هزینه‌ها را همان لحظه ثبت کنید؛ حتی وقتی اینترنت ضعیف است. سهم هر نفر خودکار حساب می‌شود.
          </p>
        </div>
        <div className="relative w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl bg-gradient-to-l from-[#5c6bc0] to-[#8e99f3] p-5 text-white">
          <span className="absolute -bottom-8 -left-4 size-28 rounded-full bg-white/15" aria-hidden />
          <p className="text-lg font-black">با انتقال کمتر تسویه کنید</p>
          <p className="mt-2 text-sm leading-7 text-white/90">
            اپ پیشنهاد می‌دهد چه کسی به چه کسی پرداخت کند تا همه حساب‌ها با کمترین دردسر صاف شود.
          </p>
        </div>
      </section>

      {/* Shortcuts */}
      <section aria-label="دسترسی سریع" className="card px-2 py-4">
        <div className="flex justify-around gap-1">
          <Shortcut href="#new-group" label="گروه جدید" color="bg-[#f57c00]" icon={<UsersIcon size={26} />} />
          <Shortcut
            href="/me"
            label="تسویه‌ها"
            color="bg-[#00897b]"
            icon={<ScaleIcon size={26} />}
            badge={toConfirm > 0 ? `${fa(toConfirm)} تأیید` : undefined}
          />
          <Shortcut
            href="/notifications"
            label="اعلان‌ها"
            color="bg-[#3a3a3a]"
            icon={<BellIcon size={26} />}
            badge={unread > 0 ? `${fa(unread)} جدید` : undefined}
          />
          <Shortcut href="/me" label="حساب من" color="bg-[#8d6e63]" icon={<WalletIcon size={26} />} />
        </div>
      </section>

      <PendingOps />

      {/* Groups */}
      <section className="card p-0">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="font-bold">گروه‌های من</h2>
          <span className="text-xs text-muted">{fa(account.groups.length)} گروه</span>
        </div>
        {account.groups.length === 0 ? (
          <div className="p-4 pt-0">
            <EmptyState title="هنوز گروهی ندارید">
              یک گروه برای جمع دوستانتان بسازید یا لینک دعوت دوستانتان را باز کنید.
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {account.groups.map((g, i) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <span
                    className={`flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                    aria-hidden
                  >
                    {g.name.trim().charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="text-xs text-muted">{balanceHint(g.myBalance)}</span>
                  </span>
                  <Balance value={g.myBalance} className="text-sm" />
                  <ChevronLeftIcon size={18} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="new-group" className="card scroll-mt-24">
        <h2 className="mb-3 font-bold">گروه جدید</h2>
        <CreateGroupForm />
      </section>
    </div>
  );
}
