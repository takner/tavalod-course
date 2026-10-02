import { formatToman } from "@/domain/money";
import type { auditLog } from "@/db/schema";

type Log = typeof auditLog.$inferSelect;
type Snapshot = { expense?: { title?: string; totalAmount?: string }; amount?: string; title?: string; displayName?: string } | null;

const money = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? formatToman(BigInt(v)) : "");

/** Human-readable, Persian one-liner for an audit entry. */
export function describeAudit(log: Log, memberName: (id: string) => string): string {
  const before = log.before as Snapshot;
  const after = log.after as Snapshot;
  const exp = after?.expense ?? before?.expense;
  const title = exp?.title ? `«${exp.title}»` : "";
  switch (`${log.entityType}:${log.action}`) {
    case "expense:create":
      return `هزینه ${title} به مبلغ ${money(exp?.totalAmount)} را ثبت کرد.`;
    case "expense:update":
      return before?.expense?.totalAmount !== after?.expense?.totalAmount
        ? `هزینه ${title} را ویرایش کرد (${money(before?.expense?.totalAmount)} ← ${money(after?.expense?.totalAmount)}).`
        : `هزینه ${title} را ویرایش کرد.`;
    case "expense:delete":
      return `هزینه ${title} به مبلغ ${money(exp?.totalAmount)} را حذف کرد.`;
    case "expense:refund":
      return `برگشت خرید ${title} به مبلغ ${money(exp?.totalAmount)} را ثبت کرد.`;
    case "settlement:create":
      return `تسویه‌ای به مبلغ ${money(after?.amount)} ثبت کرد.`;
    case "settlement:confirm":
      return `دریافت تسویه ${money(after?.amount)} را تأیید کرد.`;
    case "settlement:reject":
      return `تسویه ${money(after?.amount)} را رد کرد.`;
    case "event:create":
      return `رویداد «${after?.title ?? ""}» را ساخت.`;
    case "event:close":
      return `رویداد «${before?.title ?? ""}» را بست.`;
    case "event:reopen":
      return `رویداد «${before?.title ?? ""}» را دوباره باز کرد.`;
    case "event:cancel":
      return `رویداد «${before?.title ?? ""}» را لغو کرد.`;
    case "event:participants":
      return "شرکت‌کنندگان یک رویداد را تغییر داد.";
    case "event:details":
      return `جزئیات رویداد «${(after as { title?: string } | null)?.title ?? ""}» را به‌روز کرد.`;
    case "event:rsvp":
      return "پاسخ حضور ثبت کرد.";
    case "event:cake":
      return "تنظیمات کیک را تغییر داد.";
    case "task:create":
      return `کار «${(after as { title?: string } | null)?.title ?? ""}» را به چک‌لیست اضافه کرد.`;
    case "task:done":
      return `کار «${(before as { title?: string } | null)?.title ?? ""}» را انجام‌شده علامت زد.`;
    case "task:undone":
      return `کار «${(before as { title?: string } | null)?.title ?? ""}» را به انجام‌نشده برگرداند.`;
    case "task:delete":
      return `کار «${(before as { title?: string } | null)?.title ?? ""}» را حذف کرد.`;
    case "poll:create":
      return `نظرسنجی «${(after as { question?: string } | null)?.question ?? ""}» را ساخت.`;
    case "poll:close":
      return "یک نظرسنجی را بست.";
    case "poll:decide":
      return `تصمیم نهایی نظرسنجی را اعلام کرد: ${(after as { label?: string } | null)?.label ?? ""}`;
    case "member:add_guest":
      return `«${after?.displayName ?? ""}» را به‌عنوان عضو مهمان اضافه کرد.`;
    case "member:join":
      return "به گروه پیوست.";
    case "member:claim":
      return `حساب خود را به عضو «${memberName(log.entityId)}» وصل کرد.`;
    case "member:remove":
      return `«${before?.displayName ?? ""}» را از گروه خارج کرد.`;
    case "member:rename":
      return `نام «${before?.displayName ?? ""}» را به «${after?.displayName ?? ""}» تغییر داد.`;
    case "member:role":
      return "نقش یک عضو را تغییر داد.";
    case "group:create":
      return "گروه را ساخت.";
    case "invite:create_group_invite":
      return "لینک دعوت گروه ساخت.";
    case "invite:create_claim_invite":
      return "لینک اختصاصی برای یک عضو مهمان ساخت.";
    case "invite:revoke":
      return "یک لینک دعوت را لغو کرد.";
    default:
      return `${log.action} روی ${log.entityType}`;
  }
}
