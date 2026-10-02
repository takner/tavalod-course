import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatToman } from "@/domain/money";
import { formatJalaliDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { listNotifications } from "@/server/queries";

export const metadata: Metadata = { title: "اعلان‌ها" };

type Payload = {
  title?: string;
  amount?: string;
  previousAmount?: string;
  expenseId?: string;
  name?: string;
  claimed?: boolean;
  question?: string;
  label?: string;
  pollId?: string;
  eventId?: string;
  giftId?: string;
};

const amount = (v?: string) => (v && /^\d+$/.test(v) ? formatToman(BigInt(v)) : "");

function describe(type: string, p: Payload): string {
  switch (type) {
    case "expense_created":
      return `هزینه «${p.title}» به مبلغ ${amount(p.amount)} ثبت شد که شما در آن سهم دارید.`;
    case "expense_updated":
      return p.previousAmount && p.previousAmount !== p.amount
        ? `هزینه «${p.title}» ویرایش شد (${amount(p.previousAmount)} ← ${amount(p.amount)}).`
        : `هزینه «${p.title}» ویرایش شد.`;
    case "expense_deleted":
      return `هزینه «${p.title}» به مبلغ ${amount(p.amount)} حذف شد.`;
    case "refund_created":
      return `برگشت خرید «${p.title}» به مبلغ ${amount(p.amount)} ثبت شد.`;
    case "settlement_pending":
      return `پرداختی به مبلغ ${amount(p.amount)} به شما اعلام شده و منتظر تأیید شماست.`;
    case "settlement_confirmed":
      return `تسویه ${amount(p.amount)} شما تأیید شد.`;
    case "settlement_rejected":
      return `تسویه ${amount(p.amount)} شما توسط دریافت‌کننده رد شد.`;
    case "member_joined":
      return p.claimed ? `${p.name} حساب خود را به عضو مهمان وصل کرد.` : `${p.name} به گروه پیوست.`;
    case "event_invited":
      return `به «${p.title}» دعوت شده‌اید. حضورتان را اعلام کنید.`;
    case "poll_created":
      return `نظرسنجی جدید: «${p.question}»`;
    case "poll_decided":
      return `نتیجه «${p.question}» اعلام شد: ${p.label}`;
    case "space_added":
      return `به فضای خصوصی «${p.title}» اضافه شدید.`;
    case "gift_created":
      return `برای مشارکت در هدیه «${p.title}» دعوت شده‌اید.`;
    case "gift_status":
      return `وضعیت هدیه «${p.title}» تغییر کرد.`;
    case "task_assigned":
      return `کار «${p.title}» به شما سپرده شد.`;
    case "reminder_poll":
      return `یادآوری: مهلت نظرسنجی «${p.question}» نزدیک است و هنوز رأی نداده‌اید.`;
    case "reminder_rsvp":
      return `یادآوری: مهلت پاسخ حضور در «${p.title}» نزدیک است.`;
    case "reminder_pledge":
      return `یادآوری: مهلت اعلام مشارکت در هدیه «${p.title}» نزدیک است.`;
    default:
      return "اعلان جدید";
  }
}

function hrefFor(n: { groupId: string | null; type: string; spaceId: string | null }, p: Payload): string {
  if (!n.groupId) return "/groups";
  const g = `/groups/${n.groupId}`;
  if (p.expenseId && n.type.startsWith("expense")) return `${g}/expenses/${p.expenseId}`;
  if (p.giftId && n.spaceId) return `${g}/spaces/${n.spaceId}/gifts/${p.giftId}`;
  if (n.spaceId) return `${g}/spaces/${n.spaceId}`;
  if (p.pollId) return `${g}/polls/${p.pollId}`;
  if (p.eventId) return `${g}/events/${p.eventId}`;
  if (n.type.startsWith("settlement")) return `${g}/settle`;
  return g;
}

export default async function NotificationsPage() {
  const user = await requireUser("/notifications");
  const rows = await listNotifications({ userId: user.id });
  const unread = rows.some((r) => !r.n.readAt);
  return (
    <>
      <PageHeader
        title="اعلان‌ها"
        action={
          unread ? (
            <form action={markNotificationsReadAction}>
              <button className="btn-ghost min-h-9 px-2 text-xs">علامت‌گذاری همه به‌عنوان خوانده‌شده</button>
            </form>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="اعلانی ندارید" />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ n, groupName }) => {
            const p = n.payload as Payload;
            const href = hrefFor(n, p);
            return (
              <li key={n.id}>
                <Link href={href} className={`card block py-3 text-sm ${n.readAt ? "" : "border-primary/50 bg-primary-soft/40"}`}>
                  <p className="leading-7">{describe(n.type, p)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {groupName && `${groupName} · `}
                    {formatJalaliDateTime(n.createdAt)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
