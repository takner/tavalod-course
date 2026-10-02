import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getOwnWishlist } from "@/server/wishlists";
import { ItemForm } from "../../ItemForm";

export const metadata: Metadata = { title: "آیتم جدید" };

export default async function NewItemPage(props: PageProps<"/wishlists/[id]/items/new">) {
  const { id } = await props.params;
  const user = await requireUser(`/wishlists/${id}/items/new`);
  const data = await orNotFound(getOwnWishlist({ userId: user.id }, id));
  return (
    <>
      <PageHeader title="آیتم جدید" back={{ href: `/wishlists/${id}`, label: data.list.title }} />
      <ItemForm wishlistId={id} />
    </>
  );
}
