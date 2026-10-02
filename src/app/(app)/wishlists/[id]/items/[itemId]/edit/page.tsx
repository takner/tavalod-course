import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getOwnItem } from "@/server/wishlists";
import { ItemForm } from "../../../ItemForm";

export const metadata: Metadata = { title: "ویرایش آیتم" };

export default async function EditItemPage(props: PageProps<"/wishlists/[id]/items/[itemId]/edit">) {
  const { id, itemId } = await props.params;
  const user = await requireUser(`/wishlists/${id}`);
  const { item } = await orNotFound(getOwnItem({ userId: user.id }, itemId));
  if (item.wishlistId !== id) notFound();
  return (
    <>
      <PageHeader title="ویرایش آیتم" back={{ href: `/wishlists/${id}`, label: "فهرست" }} />
      <ItemForm wishlistId={id} item={item} />
    </>
  );
}
