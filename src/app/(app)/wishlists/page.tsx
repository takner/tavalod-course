import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { listMyWishlists } from "@/server/wishlists";
import { NewWishlistForm } from "./NewWishlistForm";

export const metadata: Metadata = { title: "ویش‌لیست‌های من" };

export default async function WishlistsPage() {
  const user = await requireUser("/wishlists");
  const actor = { userId: user.id };
  const [lists, myGroups] = await Promise.all([
    listMyWishlists(actor),
    getDb()
      .select({ id: groups.id, name: groups.name })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.userId, user.id), isNull(groupMembers.leftAt))),
  ]);
  return (
    <>
      <PageHeader title="ویش‌لیست‌های من" back={{ href: "/me", label: "حساب من" }} subtitle="چیزهایی که دوست دارید هدیه بگیرید" />
      <div className="space-y-4">
        {lists.length === 0 ? (
          <EmptyState title="هنوز فهرستی نساخته‌اید">
            یک فهرست بسازید و آیتم‌هایش را با مدل، رنگ، سایز و لینک ثبت کنید. می‌توانید آن را فقط برای خودتان نگه دارید، به گروه‌ها نشان دهید یا لینک اشتراک بسازید.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {lists.map((l) => (
              <li key={l.id}>
                <Link href={`/wishlists/${l.id}`} className="card flex items-center justify-between">
                  <span className="font-medium">{l.title}</span>
                  <span className="text-xs text-muted">{new Intl.NumberFormat("fa-IR").format(l.itemCount)} آیتم</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <section className="card">
          <h2 className="mb-3 font-bold">فهرست جدید</h2>
          <NewWishlistForm groups={myGroups} />
        </section>
      </div>
    </>
  );
}
