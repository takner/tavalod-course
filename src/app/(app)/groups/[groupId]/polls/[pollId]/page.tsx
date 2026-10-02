import type { Metadata } from "next";
import { closePollAction } from "@/app/actions-phase2";
import { ActionButton } from "@/components/forms";
import { Chip, Notice, PageHeader } from "@/components/ui";
import { formatEventInstant, POLL_KIND_LABELS, toPersianDigits } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getPollView } from "@/server/polls";
import { DecideForm, VoteForm } from "./PollForms";

export const metadata: Metadata = { title: "نظرسنجی" };

export default async function PollPage(props: PageProps<"/groups/[groupId]/polls/[pollId]">) {
  const { groupId, pollId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/polls/${pollId}`);
  const v = await orNotFound(getPollView({ userId: user.id }, pollId));
  const p = v.poll;
  const label = (o: { label: string; startsAt: Date | null }) => (o.startsAt ? formatEventInstant(o.startsAt) : o.label);
  const back = p.spaceId
    ? { href: `/groups/${groupId}/spaces/${p.spaceId}`, label: "فضای خصوصی" }
    : p.eventId
      ? { href: `/groups/${groupId}/events/${p.eventId}`, label: "رویداد" }
      : { href: `/groups/${groupId}`, label: "گروه" };
  const decided = v.options.find((o) => o.id === p.decidedOptionId);

  return (
    <>
      <PageHeader
        title={p.question}
        back={back}
        subtitle={
          <span className="flex flex-wrap gap-2">
            <Chip>{POLL_KIND_LABELS[p.kind]}</Chip>
            <Chip>{p.multi ? "چندانتخابی" : "تک‌انتخابی"}</Chip>
            <Chip tone={v.open ? "primary" : "neutral"}>{v.open ? "باز" : "بسته"}</Chip>
            {p.resultsMode === "aggregate" && <Chip tone="warning">فقط نتیجه تجمیعی</Chip>}
          </span>
        }
      />
      <div className="space-y-4">
        {decided && (
          <Notice tone="success">
            تصمیم نهایی: <strong>{label(decided)}</strong>
            {p.decisionNote && ` — ${p.decisionNote}`}
          </Notice>
        )}
        {p.deadline && <p className="text-sm text-muted">مهلت پاسخ: {formatEventInstant(p.deadline)}</p>}

        {v.open && v.eligible && (
          <section className="card">
            <h2 className="mb-2 font-bold">{v.myVotes.length ? "رأی شما (قابل تغییر تا پایان مهلت)" : "رأی شما"}</h2>
            <VoteForm groupId={groupId} pollId={pollId} multi={p.multi} options={v.options.map((o) => ({ id: o.id, label: label(o) }))} mine={v.myVotes} />
          </section>
        )}
        {!v.open && v.myVotes.length > 0 && <p className="text-sm text-muted">رأی شما: {v.options.filter((o) => v.myVotes.includes(o.id)).map(label).join("، ")}</p>}

        <section className="card" data-testid="poll-results">
          <h2 className="mb-1 font-bold">نتایج</h2>
          <p className="mb-3 text-xs text-muted">
            {toPersianDigits(v.respondents)} نفر از {toPersianDigits(v.eligibleCount)} نفر پاسخ داده‌اند · {toPersianDigits(v.eligibleCount - v.respondents)} نفر هنوز پاسخ نداده‌اند.
            {p.multi && " در چندانتخابی، درصدها «از پاسخ‌دهندگان» است و جمعشان می‌تواند بیش از ۱۰۰ باشد."}
          </p>
          {v.results === null ? (
            <p className="text-sm text-muted">نتیجه تجمیعی بعد از پاسخ حداقل ۳ نفر نمایش داده می‌شود.</p>
          ) : (
            <ul className="space-y-3">
              {v.results.map((r) => {
                const o = v.options.find((x) => x.id === r.optionId)!;
                const pct = r.respondentShareBp / 100;
                return (
                  <li key={r.optionId}>
                    <div className="flex items-center justify-between text-sm">
                      <span className={v.leaders.includes(r.optionId) ? "font-bold" : ""}>{label(o)}</span>
                      <span className="text-xs text-muted">
                        {toPersianDigits(r.count)} نفر · {toPersianDigits(Math.round(pct))}٪ پاسخ‌دهندگان
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    {r.voters.length > 0 && <p className="mt-1 text-xs text-muted">{r.voters.join("، ")}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {v.nonRespondents.length > 0 && <p className="mt-3 text-xs text-muted">منتظر پاسخ: {v.nonRespondents.join("، ")}</p>}
          <p className="mt-3 text-xs leading-6 text-muted">
            {p.resultsMode === "aggregate"
              ? "چه کسی پاسخ فردی را می‌بیند؟ هیچ عضو و مدیری در اپ؛ فقط جمع‌ها. پاسخ‌ها با هویت ذخیره می‌شوند تا رأی تکراری ثبت نشود و مدیر سرور به دیتابیس دسترسی دارد."
              : "در این نظرسنجی همه کسانی که حق رأی دارند، می‌بینند هر نفر چه گزینه‌ای را انتخاب کرده است."}
          </p>
        </section>

        {v.canManage && (
          <section className="card space-y-3">
            <h2 className="font-bold">مدیریت</h2>
            {p.status === "open" ? (
              <ActionButton action={closePollAction.bind(null, groupId, pollId)} className="btn-secondary w-full" confirmText="نظرسنجی بسته شود؟ بعد از آن رأی جدید پذیرفته نمی‌شود.">
                ۱. بستن نظرسنجی
              </ActionButton>
            ) : (
              <DecideForm groupId={groupId} pollId={pollId} options={v.options.map((o) => ({ id: o.id, label: label(o) }))} canApply={!!p.eventId && !p.spaceId && (p.kind === "datetime" || p.kind === "place")} current={p.decidedOptionId} />
            )}
          </section>
        )}
      </div>
    </>
  );
}
