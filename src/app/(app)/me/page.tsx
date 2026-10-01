import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { PendingOps } from "@/components/PendingOps";
import { Balance, Money, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getMyAccount } from "@/server/queries";
import { NameForm } from "./NameForm";

export const metadata: Metadata = { title: "حساب من" };

export default async function MePage(props: PageProps<"/me">) {
  const { welcome } = await props.searchParams;
  const user = await requireUser("/me");
  const account = await getMyAccount({ userId: user.id });
  const name = (id: string) => account.memberNames.get(id) ?? "—";

  return (
    <>
      <PageHeader title="حساب من" subtitle={user.email} />
      <div className="space-y-4">
        {welcome && <Notice tone="success">خوش آمدید! ابتدا نامی را که دوستانتان با آن شما را می‌شناسند وارد کنید.</Notice>}
        <section className="card">
          <NameForm name={user.name} />
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">دفتر حساب</h2>
          <p className="text-xs leading-6 text-muted">
            این بخش فقط نشان می‌دهد چه کسی به چه کسی بدهکار است؛ موجودی قابل برداشت نیست و پولی در اپ نگهداری نمی‌شود.
          </p>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-positive-soft p-3">
              <p className="text-xs text-muted">طلب من</p>
              <Money value={account.owedToMe} className="font-bold text-positive" />
            </div>
            <div className="rounded-xl bg-negative-soft p-3">
              <p className="text-xs text-muted">بدهی من</p>
              <Money value={account.iOwe} className="font-bold text-negative" />
            </div>
          </div>
          <ul className="divide-y divide-border">
            {account.groups.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}/balance/${g.myMemberId}`} className="flex justify-between py-2 text-sm">
                  <span>{g.name}</span>
                  <Balance value={g.myBalance} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {(account.pendingIncoming.length > 0 || account.pendingOutgoing.length > 0) && (
          <section className="card space-y-2">
            <h2 className="font-bold">تسویه‌های در انتظار</h2>
            {account.pendingIncoming.map(({ s, groupName }) => (
              <Link key={s.id} href={`/groups/${s.groupId}/settle`} className="flex justify-between text-sm">
                <span>
                  {name(s.fromMemberId)} به شما ({groupName}) — منتظر تأیید شما
                </span>
                <Money value={s.amount} />
              </Link>
            ))}
            {account.pendingOutgoing.map(({ s, groupName }) => (
              <div key={s.id} className="flex justify-between text-sm text-muted">
                <span>
                  شما به {name(s.toMemberId)} ({groupName}) — منتظر تأیید او
                </span>
                <Money value={s.amount} />
              </div>
            ))}
          </section>
        )}

        <PendingOps />
        <LogoutButton userId={user.id} />
      </div>
    </>
  );
}
