import type { Metadata } from "next";
import Link from "next/link";
import { deleteWishlistAction, enableShareLinkAction, revokeShareLinkAction } from "@/app/actions-phase2";
import { ActionButton } from "@/components/forms";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { WishItem } from "@/components/WishItem";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getOwnWishlist } from "@/server/wishlists";
import { EditWishlistForm } from "../NewWishlistForm";
import { ShareLinkButton } from "./ShareLinkButton";

export const metadata: Metadata = { title: "ویش‌لیست" };

export default async function WishlistPage(props: PageProps<"/wishlists/[id]">) {
  const { id } = await props.params;
  const user = await requireUser(`/wishlists/${id}`);
  const data = await orNotFound(getOwnWishlist({ userId: user.id }, id));
  const sharedNames = data.myGroups.filter((g) => data.sharedGroupIds.includes(g.id)).map((g) => g.name);

  return (
    <>
      <PageHeader
        title={data.list.title}
        back={{ href: "/wishlists", label: "ویش‌لیست‌های من" }}
        subtitle={sharedNames.length ? `قابل مشاهده برای: ${sharedNames.join("، ")}` : "فقط برای خودم"}
      />
      <div className="space-y-4">
        <Link href={`/wishlists/${id}/items/new`} className="btn-primary w-full">
          + افزودن آیتم
        </Link>
        {data.items.length === 0 ? (
          <EmptyState title="فهرست خالی است">کالا، کتاب الکترونیک، بلیت یا یک تجربه تفریحی اضافه کنید.</EmptyState>
        ) : (
          <div className="space-y-3">
            {data.items.map((item) => (
              <WishItem key={item.id} item={item}>
                <Link href={`/wishlists/${id}/items/${item.id}/edit`} className="btn-secondary min-h-9 px-3 text-xs">
                  ویرایش
                </Link>
              </WishItem>
            ))}
          </div>
        )}
        <Notice>برای اینکه سورپرایز خراب نشود، این صفحه هیچ‌وقت نشان نمی‌دهد چه کسی چه چیزی را رزرو یا خریده است.</Notice>

        <section className="card space-y-3">
          <h2 className="font-bold">تنظیمات نمایش</h2>
          <EditWishlistForm wishlistId={id} groups={data.myGroups} title={data.list.title} description={data.list.description} selected={data.sharedGroupIds} />
        </section>

        <section className="card space-y-2">
          <h2 className="font-bold">لینک اشتراک</h2>
          <p className="text-xs leading-6 text-muted">
            هر کس لینک را داشته باشد، فقط همین فهرست را (بدون رزروها) می‌بیند. ساختن لینک جدید، لینک قبلی را باطل می‌کند.
          </p>
          <ShareLinkButton action={enableShareLinkAction.bind(null, id)} label={data.hasShareLink ? "ساخت لینک جدید" : "ساخت لینک اشتراک"} />
          {data.hasShareLink && (
            <ActionButton action={revokeShareLinkAction.bind(null, id)} className="btn-danger w-full" confirmText="لینک اشتراک لغو شود؟">
              لغو لینک اشتراک
            </ActionButton>
          )}
        </section>

        <ActionButton action={deleteWishlistAction.bind(null, id)} className="btn-danger w-full" confirmText="این فهرست حذف شود؟">
          حذف فهرست
        </ActionButton>
      </div>
    </>
  );
}
