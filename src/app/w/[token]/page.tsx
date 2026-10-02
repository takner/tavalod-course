import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { WishItem } from "@/components/WishItem";
import { toAppError } from "@/server/errors";
import { getSharedWishlist } from "@/server/wishlists";

export const metadata: Metadata = { title: "ویش‌لیست", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Public read-only view through a revocable share link: list content only, never reservations. */
export default async function SharedWishlistPage(props: PageProps<"/w/[token]">) {
  const { token } = await props.params;
  let data;
  try {
    data = await getSharedWishlist(token);
  } catch (err) {
    if (toAppError(err).code === "NOT_FOUND") notFound();
    throw err;
  }
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <header>
        <p className="text-sm text-muted">ویش‌لیست {data.ownerName}</p>
        <h1 className="text-xl font-bold">{data.list.title}</h1>
        {data.list.description && <p className="mt-1 text-sm text-muted">{data.list.description}</p>}
      </header>
      {data.items.length === 0 ? (
        <EmptyState title="این فهرست خالی است" />
      ) : (
        data.items.map((item) => <WishItem key={item.id} item={item} imageQuery={`?t=${encodeURIComponent(token)}`} />)
      )}
      <p className="text-center text-xs text-muted">برای هماهنگی خرید با دوستان، وارد گروه مشترکتان در «تولد» شوید.</p>
    </main>
  );
}
