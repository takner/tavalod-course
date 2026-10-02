import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { listGroupWishlists } from "@/server/wishlists";

export const metadata: Metadata = { title: "ویش‌لیست‌های گروه" };

export default async function GroupWishlistsPage(props: PageProps<"/groups/[groupId]/wishlists">) {
  const { groupId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/wishlists`);
  const lists = await orNotFound(listGroupWishlists({ userId: user.id }, groupId));
  return (
    <>
      <PageHeader title="ویش‌لیست‌های اعضا" back={{ href: `/groups/${groupId}`, label: "گروه" }} />
      <div className="space-y-3">
        {lists.length === 0 ? (
          <EmptyState title="هنوز کسی فهرستی با این گروه به اشتراک نگذاشته">
            از «حساب من ← ویش‌لیست‌های من» فهرست بسازید و این گروه را برای نمایش انتخاب کنید.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {lists.map((l) => (
              <li key={l.id}>
                <Link href={`/groups/${groupId}/wishlists/${l.id}`} className="card flex items-center justify-between">
                  <span>
                    <span className="block font-medium">{l.title}</span>
                    <span className="text-xs text-muted">{l.ownerUserId === user.id ? "فهرست خودم" : l.ownerName}</span>
                  </span>
                  <span aria-hidden className="text-muted">‹</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/wishlists" className="btn-secondary w-full">
          ویش‌لیست‌های خودم
        </Link>
      </div>
    </>
  );
}
