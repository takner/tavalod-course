import { BottomNav } from "@/components/BottomNav";
import { OnlineBanner } from "@/components/OnlineBanner";
import { SyncProvider } from "@/components/SyncProvider";
import { requireUser } from "@/lib/session";
import { unreadNotificationCount } from "@/server/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadNotificationCount({ userId: user.id });
  return (
    <SyncProvider userId={user.id}>
      <OnlineBanner />
      <main className="mx-auto max-w-xl px-4 pt-5 pb-28">{children}</main>
      <BottomNav unread={unread} />
    </SyncProvider>
  );
}
