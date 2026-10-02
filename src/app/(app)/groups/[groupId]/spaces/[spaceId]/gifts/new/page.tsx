import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getSpaceView } from "@/server/spaces";
import { giftableItems } from "@/server/wishlists";
import { NewGiftForm } from "./NewGiftForm";

export const metadata: Metadata = { title: "هدیه گروهی" };

export default async function NewGiftPage(props: PageProps<"/groups/[groupId]/spaces/[spaceId]/gifts/new">) {
  const { groupId, spaceId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/spaces/${spaceId}`);
  const actor = { userId: user.id };
  const view = await orNotFound(getSpaceView(actor, spaceId));
  const items = await giftableItems(actor, groupId);
  return (
    <>
      <PageHeader title="هدیه گروهی جدید" back={{ href: `/groups/${groupId}/spaces/${spaceId}`, label: view.space.title }} />
      <NewGiftForm
        groupId={groupId}
        spaceId={spaceId}
        meId={view.me.memberId}
        members={view.members.map((m) => ({ id: m.id, name: m.name }))}
        items={items.map((i) => ({ id: i.id, label: `${i.title} (ویش‌لیست ${i.ownerName})` }))}
      />
    </>
  );
}
