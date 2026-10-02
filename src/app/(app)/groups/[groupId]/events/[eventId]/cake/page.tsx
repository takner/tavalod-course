import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { toPersianDigits } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getEventPlan } from "@/server/event-plan";
import { CakeForm } from "./CakeForm";

export const metadata: Metadata = { title: "محاسبه کیک" };

const g = (grams: number) => `${toPersianDigits(grams)} گرم`;

export default async function CakePage(props: PageProps<"/groups/[groupId]/events/[eventId]/cake">) {
  const { groupId, eventId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/events/${eventId}/cake`);
  const plan = await orNotFound(getEventPlan({ userId: user.id }, groupId, eventId));
  const ev = plan.event;
  const h = plan.headcount;
  return (
    <>
      <PageHeader title="محاسبه کیک" back={{ href: `/groups/${groupId}/events/${eventId}`, label: ev.title }} />
      <div className="space-y-4">
        <section className="card space-y-2 text-sm leading-7" data-testid="cake-result">
          <p className="text-xs text-muted">برآورد (بدون هوش مصنوعی؛ همه فرض‌ها قابل تغییرند)</p>
          <p>
            {toPersianDigits(h.adults)} بزرگسال × {g(ev.cakeAdultGrams)} + {toPersianDigits(h.children)} کودک × {g(ev.cakeChildGrams)} ={" "}
            <strong>{g(plan.cake.baseGrams)}</strong>
          </p>
          <p>
            + {toPersianDigits(ev.cakeMarginBp / 100)}٪ اضافه = <strong>{g(plan.cake.withMarginGrams)}</strong>
          </p>
          <p>
            گرد به بالا با گام {g(ev.cakeRoundStepGrams)} ← پیشنهاد سفارش:{" "}
            <strong className="text-lg text-primary">{toPersianDigits(plan.cake.suggestedGrams / 1000)} کیلو</strong>
          </p>
          {ev.cakeOrderGrams !== null && (
            <p className="rounded-lg bg-positive-soft px-3 py-2 text-positive">سفارش نهایی برگزارکننده: {toPersianDigits(ev.cakeOrderGrams / 1000)} کیلو</p>
          )}
          <p className="text-xs text-muted">
            تعداد مهمانان {h.overridden ? "را برگزارکننده تعیین کرده" : "از پاسخ‌های «می‌آیم» و همراهان آمده"}. این‌ها اعداد نمونه‌اند، نه توصیه قطعی برای هر مراسم.
          </p>
        </section>
        {plan.me.canManage && (
          <CakeForm
            groupId={groupId}
            eventId={eventId}
            defaults={{
              adultGrams: ev.cakeAdultGrams,
              childGrams: ev.cakeChildGrams,
              marginPercent: ev.cakeMarginBp / 100,
              roundStepGrams: ev.cakeRoundStepGrams,
              orderGrams: ev.cakeOrderGrams,
            }}
          />
        )}
      </div>
    </>
  );
}
