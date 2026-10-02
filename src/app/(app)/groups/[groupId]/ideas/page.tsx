import type { Metadata } from "next";
import Link from "next/link";
import { Chip, EmptyState, PageHeader } from "@/components/ui";
import { filterActivities } from "@/domain/activities";
import { formatToman, toAsciiDigits } from "@/domain/money";
import { toPersianDigits } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getGroupMembersForForm } from "@/server/queries";

export const metadata: Metadata = { title: "ایده برنامه" };

export default async function IdeasPage(props: PageProps<"/groups/[groupId]/ideas">) {
  const { groupId } = await props.params;
  const sp = await props.searchParams;
  const user = await requireUser(`/groups/${groupId}/ideas`);
  const data = await orNotFound(getGroupMembersForForm({ userId: user.id }, groupId));
  const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(toAsciiDigits(v)) ? Number(toAsciiDigits(v)) : undefined);
  const people = num(sp.people) ?? data.members.length;
  const budget = num(sp.budget);
  const flags = { familyFriendly: sp.family === "1", alcoholFree: sp.noalcohol === "1", gamblingFree: sp.nogambling === "1" };
  const ideas = filterActivities({ people, maxBudgetPerPerson: budget !== undefined ? BigInt(budget) : undefined, ...flags });

  return (
    <>
      <PageHeader title="ایده برای برنامه" back={{ href: `/groups/${groupId}`, label: data.group.name }} subtitle="الگوهای عمومی و قابل ویرایش — نه پیشنهاد مکان مشخص" />
      <div className="space-y-4">
        <form className="card space-y-3" method="get">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              تعداد نفرات
              <input name="people" type="number" min={1} defaultValue={people} className="input mt-1" />
            </label>
            <label className="text-sm">
              بودجه هر نفر تا (تومان)
              <input name="budget" type="number" min={0} step={50000} defaultValue={budget ?? ""} className="input mt-1" />
            </label>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input type="checkbox" name="family" value="1" defaultChecked={flags.familyFriendly} /> خانوادگی
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" name="noalcohol" value="1" defaultChecked={flags.alcoholFree} /> بدون الکل
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" name="nogambling" value="1" defaultChecked={flags.gamblingFree} /> بدون قمار
            </label>
          </div>
          <button className="btn-secondary w-full">فیلتر</button>
        </form>
        {ideas.length === 0 ? (
          <EmptyState title="الگویی با این فیلترها پیدا نشد">فیلترها را کمی بازتر کنید.</EmptyState>
        ) : (
          ideas.map((t) => (
            <article key={t.id} className="card space-y-2">
              <h2 className="font-bold">{t.title}</h2>
              <p className="text-sm leading-7 text-muted">{t.description}</p>
              <div className="flex flex-wrap gap-1">
                <Chip>
                  {toPersianDigits(t.minPeople)} تا {toPersianDigits(t.maxPeople)} نفر
                </Chip>
                <Chip>
                  حدود {formatToman(t.budgetPerPerson[0], { unit: false })} تا {formatToman(t.budgetPerPerson[1])} برای هر نفر
                </Chip>
                {t.familyFriendly && <Chip tone="positive">خانوادگی</Chip>}
                <Chip>{t.setting === "indoor" ? "سرپوشیده" : "فضای باز"}</Chip>
              </div>
              <p className="text-xs text-muted">کارهای پیشنهادی: {t.checklist.join("، ")}</p>
              <Link
                href={t.eventType === "birthday" ? `/groups/${groupId}/birthdays/new` : `/groups/${groupId}/events/new?template=${t.id}`}
                className="btn-secondary min-h-9 px-3 text-xs"
              >
                استفاده از این الگو
              </Link>
            </article>
          ))
        )}
        <p className="text-center text-xs leading-6 text-muted">بودجه‌ها تقریبی و قابل ویرایش‌اند. قیمت، ساعت کاری و شرایط هر مکان واقعی را از منبع رسمی همان مکان بررسی کنید.</p>
      </div>
    </>
  );
}
