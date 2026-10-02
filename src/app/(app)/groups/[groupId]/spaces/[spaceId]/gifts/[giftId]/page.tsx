import type { Metadata } from "next";
import Link from "next/link";
import { decideSettlementAction } from "@/app/actions";
import { cancelGiftAction, giftStatusAction } from "@/app/actions-phase2";
import { ActionButton } from "@/components/forms";
import { OnlineOnly } from "@/components/OnlineOnly";
import { Chip, Notice, PageHeader } from "@/components/ui";
import { formatToman } from "@/domain/money";
import { formatEventInstant, formatJalaliDateTime, GIFT_STATUS_LABELS, METHOD_LABELS } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getGiftView } from "@/server/gift-plans";
import { PaymentForm, PledgeForm, PurchaseForm, ReallocateForm } from "./GiftForms";

export const metadata: Metadata = { title: "هدیه گروهی" };

const PLEDGE_LABEL: Record<string, string> = { invited: "پاسخ نداده", pledged: "متعهد", declined: "مشارکت نمی‌کند" };

export default async function GiftPage(props: PageProps<"/groups/[groupId]/spaces/[spaceId]/gifts/[giftId]">) {
  const { groupId, spaceId, giftId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/spaces/${spaceId}/gifts/${giftId}`);
  const v = await orNotFound(getGiftView({ userId: user.id }, giftId));
  const { gift, ledger } = v;
  const name = (id: string) => v.names.get(id)?.name ?? "—";
  const buyer = name(gift.buyerMemberId);
  const open = ["proposed", "collecting", "ready_to_buy"].includes(gift.status);
  const mine = ledger.perMember.find((m) => m.memberId === v.me.memberId);
  const suggestion = v.suggestedShares.find((s) => s.memberId === v.me.memberId)?.amount ?? null;
  const pledged = v.pledges.filter((p) => p.status === "pledged");
  const held = ledger.collectedConfirmed - ledger.refundedConfirmed;
  const base = `/groups/${groupId}/spaces/${spaceId}`;

  return (
    <>
      <PageHeader title={`🎁 ${gift.title}`} back={{ href: base, label: "فضای خصوصی" }} subtitle={<Chip tone={gift.status === "cancelled" ? "negative" : "primary"}>{GIFT_STATUS_LABELS[gift.status]}</Chip>} />
      <div className="space-y-4">
        <section className="card space-y-1 text-sm">
          <p>مسئول خرید: <strong>{buyer}</strong></p>
          {gift.budget !== null && <p>بودجه تقریبی: {formatToman(gift.budget)}</p>}
          {gift.contributionDeadline && <p>مهلت اعلام مشارکت: {formatEventInstant(gift.contributionDeadline)}</p>}
          {v.item && <p>از ویش‌لیست: {v.item.title}{v.item.model ? ` (${v.item.model})` : ""}</p>}
          {gift.productUrl && (
            <a href={gift.productUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline" dir="ltr">
              {new URL(gift.productUrl).hostname}
            </a>
          )}
          {gift.description && <p className="leading-7 text-muted">{gift.description}</p>}
          {gift.receiptFileId && (
            <a href={`/api/files/${gift.receiptFileId}`} target="_blank" className="inline-block text-primary underline">
              مشاهده رسید خرید
            </a>
          )}
        </section>

        {gift.status === "purchased" && (
          <Notice tone="success">
            خرید ثبت شده است ({formatToman(ledger.purchaseTotal)}). پولی که هر نفر قبلاً داده، از سهم نهایی‌اش کم شده؛ ستون «مانده» نشان می‌دهد چه کسی هنوز بدهکار یا طلبکار است.
          </Notice>
        )}
        {gift.status === "cancelled" && held > 0n && (
          <Notice tone="warning">این هدیه لغو شده و {formatToman(held)} هنوز نزد {buyer} است تا به صاحبانش بازپرداخت شود.</Notice>
        )}

        {/* Three separate concepts */}
        <section className="grid grid-cols-2 gap-2 text-center text-sm" data-testid="gift-money">
          <div className="card p-3">
            <p className="text-xs text-muted">تعهد (پول نیست)</p>
            <p className="font-bold tabular">{formatToman(ledger.pledged)}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-muted">{gift.status === "purchased" || gift.status === "delivered" ? `پرداخت‌شده به ${buyer}` : `وصول‌شده نزد ${buyer}`}</p>
            <p className="font-bold tabular text-positive">{formatToman(held)}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-muted">در انتظار تأیید دریافت</p>
            <p className="font-bold tabular text-warning">{formatToman(ledger.collectedPending)}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-muted">هزینه نهایی خرید</p>
            <p className="font-bold tabular">{formatToman(ledger.purchaseTotal)}</p>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-2 font-bold">مشارکت‌کنندگان</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 text-right font-normal">نام</th>
                  <th className="text-right font-normal">تعهد</th>
                  <th className="text-right font-normal">پرداخت‌شده</th>
                  <th className="text-right font-normal">سهم نهایی</th>
                  <th className="text-right font-normal">مانده</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {v.pledges.map((p) => {
                  const row = ledger.perMember.find((m) => m.memberId === p.memberId);
                  const remaining = row ? row.remaining : 0n;
                  return (
                    <tr key={p.memberId}>
                      <td className="py-1.5">{name(p.memberId)}</td>
                      <td className="tabular">{p.status === "pledged" ? formatToman(p.amount!, { unit: false }) : PLEDGE_LABEL[p.status]}</td>
                      <td className="tabular">
                        {formatToman(row?.paid ?? 0n, { unit: false })}
                        {row && row.pending > 0n && <span className="text-warning"> (+{formatToman(row.pending, { unit: false })})</span>}
                      </td>
                      <td className="tabular">{formatToman(row?.share ?? 0n, { unit: false })}</td>
                      <td className={`tabular ${remaining > 0n ? "text-negative" : remaining < 0n ? "text-positive" : ""}`}>
                        {gift.status === "purchased" || gift.status === "delivered" || gift.status === "cancelled"
                          ? remaining > 0n
                            ? `بدهکار ${formatToman(remaining, { unit: false })}`
                            : remaining < 0n
                              ? `طلبکار ${formatToman(-remaining, { unit: false })}`
                              : "صاف"
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted">
            ارقام به تومان. پرداخت‌شده = پول تأییدشده‌ای که به مسئول خرید رسیده (منهای بازپرداخت‌ها). عدد داخل پرانتز هنوز تأیید نشده است. مانده بعد از خرید = سهم نهایی − پرداخت‌شده.
          </p>
        </section>

        {open && v.myPledge && (
          <section className="card">
            <h2 className="mb-2 font-bold">تعهد من</h2>
            <PledgeForm groupId={groupId} spaceId={spaceId} giftId={giftId} suggestion={suggestion?.toString() ?? null} current={v.myPledge.status === "pledged" ? v.myPledge.amount!.toString() : null} />
          </section>
        )}

        {!v.me.isBuyer && gift.status !== "cancelled" && gift.status !== "delivered" && (
          <section className="card">
            <h2 className="mb-1 font-bold">پرداخت به {buyer}</h2>
            <p className="mb-2 text-xs leading-6 text-muted">
              پول را با کارت یا نقدی بدهید و اینجا ثبت کنید. تا وقتی {buyer} دریافت را تأیید نکند، «وصول‌شده» حساب نمی‌شود.
            </p>
            <OnlineOnly>
              <PaymentForm
                groupId={groupId}
                spaceId={spaceId}
                giftId={giftId}
                purpose="collection"
                from={v.me.memberId}
                to={gift.buyerMemberId}
                suggested={(mine && mine.remaining > 0n ? mine.remaining : v.myPledge?.status === "pledged" ? v.myPledge.amount! - (mine?.paid ?? 0n) : 0n).toString()}
              />
            </OnlineOnly>
          </section>
        )}

        {v.me.isBuyer && (
          <section className="card">
            <h2 className="mb-1 font-bold">بازپرداخت به مشارکت‌کننده</h2>
            <p className="mb-2 text-xs text-muted">برای پول اضافه، لغو یا برگشت خرید. دریافت‌کننده باید تأیید کند.</p>
            <OnlineOnly>
              <PaymentForm
                groupId={groupId}
                spaceId={spaceId}
                giftId={giftId}
                purpose="refund"
                from={gift.buyerMemberId}
                to={null}
                options={ledger.perMember.filter((m) => m.memberId !== gift.buyerMemberId && m.remaining < 0n).map((m) => ({ id: m.memberId, name: name(m.memberId), owed: (-m.remaining).toString() }))}
                suggested=""
              />
            </OnlineOnly>
          </section>
        )}

        {v.settlements.length > 0 && (
          <section className="card">
            <h2 className="mb-2 font-bold">سابقه پرداخت‌ها</h2>
            <ul className="space-y-2 text-sm">
              {v.settlements.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {s.purpose === "refund" ? "بازپرداخت" : "پرداخت سهم"}: {name(s.fromMemberId)} ← {name(s.toMemberId)} · {formatToman(s.amount)}
                    <span className="block text-xs text-muted">
                      {METHOD_LABELS[s.method]} · {formatJalaliDateTime(s.createdAt)}
                    </span>
                  </span>
                  {s.canDecide ? (
                    <OnlineOnly>
                      <span className="flex gap-1">
                        <ActionButton action={decideSettlementAction.bind(null, groupId, s.id, "confirm")} className="btn-primary min-h-8 px-2 text-xs">
                          دریافت کردم
                        </ActionButton>
                        <ActionButton action={decideSettlementAction.bind(null, groupId, s.id, "reject")} className="btn-danger min-h-8 px-2 text-xs" confirmText="رد شود؟">
                          نه
                        </ActionButton>
                      </span>
                    </OnlineOnly>
                  ) : (
                    <Chip tone={s.status === "confirmed" ? "positive" : s.status === "rejected" ? "negative" : "warning"}>
                      {s.status === "confirmed" ? "تأییدشده" : s.status === "rejected" ? "ردشده" : "در انتظار تأیید"}
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {v.me.isBuyer && open && (
          <section className="card">
            <h2 className="mb-1 font-bold">ثبت خرید نهایی</h2>
            <p className="mb-2 text-xs leading-6 text-muted">
              مبلغ واقعی و رسید را ثبت کنید. سهم هر نفر از سقف تعهدش بیشتر نمی‌شود؛ اگر قیمت بالاتر رفت، یا افراد تعهدشان را بالا ببرند یا کسی مبلغ اضافه را بپذیرد (تقسیم دستی). پیش‌پرداخت‌ها خودکار از سهم هر نفر کم می‌شوند.
            </p>
            {pledged.length === 0 ? (
              <Notice tone="warning">هنوز کسی تعهد نداده است.</Notice>
            ) : (
              <PurchaseForm groupId={groupId} spaceId={spaceId} giftId={giftId} contributors={pledged.map((p) => ({ id: p.memberId, name: name(p.memberId), cap: p.amount!.toString() }))} />
            )}
          </section>
        )}

        {gift.purchaseExpenseId && (
          <Link href={`/groups/${groupId}/expenses/${gift.purchaseExpenseId}`} className="btn-secondary w-full">
            جزئیات هزینه خرید و «برگشت خرید» (جزئی یا کامل)
          </Link>
        )}

        {mine && v.reallocationTargets.length > 0 && (gift.status === "cancelled" ? mine.paid > 0n : mine.remaining < 0n) && (
          <section className="card">
            <h2 className="mb-1 font-bold">انتقال اعتبار من به هدیه دیگر</h2>
            <p className="mb-2 text-xs text-muted">فقط با انتخاب خودتان؛ پول نزد همان مسئول خرید می‌ماند.</p>
            <ReallocateForm groupId={groupId} spaceId={spaceId} giftId={giftId} targets={v.reallocationTargets.map((t) => ({ id: t.id, title: t.title }))} />
          </section>
        )}

        {v.me.canManage && (
          <section className="card space-y-2">
            <h2 className="font-bold">وضعیت</h2>
            <div className="flex flex-wrap gap-2">
              {gift.status === "proposed" && (
                <ActionButton action={giftStatusAction.bind(null, groupId, spaceId, giftId, "collecting")} className="btn-secondary min-h-9 px-3 text-xs">
                  شروع جمع‌آوری مشارکت
                </ActionButton>
              )}
              {(gift.status === "proposed" || gift.status === "collecting") && (
                <ActionButton action={giftStatusAction.bind(null, groupId, spaceId, giftId, "ready_to_buy")} className="btn-secondary min-h-9 px-3 text-xs">
                  آماده خرید
                </ActionButton>
              )}
              {gift.status === "purchased" && (
                <ActionButton action={giftStatusAction.bind(null, groupId, spaceId, giftId, "delivered")} className="btn-primary min-h-9 px-3 text-xs">
                  تحویل داده شد
                </ActionButton>
              )}
              {gift.status !== "cancelled" && gift.status !== "delivered" && (
                <ActionButton action={cancelGiftAction.bind(null, groupId, spaceId, giftId)} className="btn-danger min-h-9 px-3 text-xs" confirmText="هدیه لغو شود؟ پول‌های وصول‌شده باید بازپرداخت شوند.">
                  لغو هدیه
                </ActionButton>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
