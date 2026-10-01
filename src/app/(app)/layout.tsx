import { AppHeader } from "@/components/AppHeader";
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
      <AppHeader unread={unread} />
      <OnlineBanner />
      <main className="mx-auto max-w-xl px-4 pt-4 pb-28">{children}</main>
      <BottomNav unread={unread} />
    </SyncProvider>
  );
}
