import type { Metadata } from "next";
import { markPurchasedAction, releaseReservationAction } from "@/app/actions-phase2";
import { ActionButton } from "@/components/forms";
import { OnlineOnly } from "@/components/OnlineOnly";
import { Chip, EmptyState, Notice, PageHeader } from "@/components/ui";
import { WishItem } from "@/components/WishItem";
import { formatJalaliDate } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getWishlistInGroup } from "@/server/wishlists";
import { ReserveForm } from "./ReserveForm";

export const metadata: Metadata = { title: "ویش‌لیست" };

export default async function GroupWishlistPage(props: PageProps<"/groups/[groupId]/wishlists/[listId]">) {
  const { groupId, listId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/wishlists/${listId}`);
  const data = await orNotFound(getWishlistInGroup({ userId: user.id }, groupId, listId));
  return (
    <>
      <PageHeader title={data.list.title} back={{ href: `/groups/${groupId}/wishlists`, label: "ویش‌لیست‌ها" }} subtitle={data.isOwner ? "فهرست خودم" : `ویش‌لیست ${data.ownerName}`} />
      <div className="space-y-3">
        {data.isOwner ? (
          <Notice>این فهرست خودتان است؛ رزروها و هماهنگی‌های خرید دیگران به شما نشان داده نمی‌شود.</Notice>
        ) : (
          <Notice>با رزرو یک آیتم، بقیه می‌فهمند آن را شما می‌خرید و خرید تکراری پیش نمی‌آید. {data.ownerName} رزروها را نمی‌بیند.</Notice>
        )}
        {data.items.length === 0 && <EmptyState title="این فهرست خالی است" />}
        {data.items.map((item) => (
          <WishItem key={item.id} item={item}>
            {item.deletedAt && <Chip tone="warning">صاحب فهرست این آیتم را حذف کرده؛ رزرو شما محفوظ است</Chip>}
            {!data.isOwner && (
              <div className="border-t border-border pt-3">
                {item.reservation ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      {item.reservation.status === "purchased" ? "خریداری‌شده" : "رزروشده"} توسط{" "}
                      <strong>{item.reservation.byMe ? "شما" : item.reservation.reserverName}</strong>
                      {item.reservation.viaGift && " (هدیه گروهی)"}
                      {item.reservation.deadline && ` — تا ${formatJalaliDate(item.reservation.deadline)}`}
                    </p>
                    {item.reservation.note && <p className="text-xs text-muted">{item.reservation.note}</p>}
                    {item.reservation.byMe && item.reservation.status === "active" && !item.reservation.viaGift && (
                      <OnlineOnly>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton action={markPurchasedAction.bind(null, groupId, listId, item.reservation.id)} className="btn-primary min-h-9 px-3 text-xs">
                            خریدم
                          </ActionButton>
                          <ActionButton
                            action={releaseReservationAction.bind(null, groupId, listId, item.reservation.id)}
                            className="btn-secondary min-h-9 px-3 text-xs"
                            confirmText="رزرو آزاد شود تا دیگران بتوانند آن را بخرند؟"
                          >
                            آزاد کردن رزرو
                          </ActionButton>
                        </div>
                      </OnlineOnly>
                    )}
                  </div>
                ) : item.status === "wanted" && !item.deletedAt ? (
                  <ReserveForm groupId={groupId} listId={listId} itemId={item.id} />
                ) : null}
              </div>
            )}
          </WishItem>
        ))}
      </div>
    </>
  );
}
