import type { Metadata } from "next";
import Link from "next/link";
import { PendingOps } from "@/components/PendingOps";
import { Balance, balanceHint, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { listMyGroups } from "@/server/queries";
import { CreateGroupForm } from "./CreateGroupForm";

export const metadata: Metadata = { title: "گروه‌ها" };

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await listMyGroups({ userId: user.id });
  return (
    <>
      <PageHeader title="گروه‌های من" subtitle={`سلام ${user.name}`} />
      <div className="space-y-4">
        <PendingOps />
        {groups.length === 0 ? (
          <EmptyState title="هنوز گروهی ندارید">
            یک گروه برای جمع دوستانتان بسازید (مثلاً «دوستان دانشگاه») یا از لینک دعوت دوستانتان وارد شوید.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`} className="card flex items-center justify-between gap-3 hover:border-primary/40">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-left text-sm">
                    <Balance value={g.myBalance} />
                    <span className="block text-xs text-muted">{balanceHint(g.myBalance)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <section className="card">
          <h2 className="mb-3 font-bold">گروه جدید</h2>
          <CreateGroupForm />
        </section>
      </div>
    </>
  );
}
