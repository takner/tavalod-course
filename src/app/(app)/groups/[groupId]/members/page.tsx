import type { Metadata } from "next";
import { removeMemberAction, revokeInviteAction, setRoleAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { Chip, PageHeader } from "@/components/ui";
import { formatJalaliDateTime, ROLE_LABELS } from "@/lib/format";
import { orNotFound } from "@/lib/page";
import { requireUser } from "@/lib/session";
import { getGroupView, listInvites } from "@/server/queries";
import { AddGuestForm, ClaimInviteForm, GroupInviteForm, RenameForm } from "./MemberForms";

export const metadata: Metadata = { title: "اعضا" };

export default async function MembersPage(props: PageProps<"/groups/[groupId]/members">) {
  const { groupId } = await props.params;
  const user = await requireUser(`/groups/${groupId}/members`);
  const actor = { userId: user.id };
  const [view, invites] = await orNotFound(Promise.all([getGroupView(actor, groupId), listInvites(actor, groupId)]));
  const admin = view.me.isAdmin;
  const owner = view.me.role === "owner";
  const active = view.members.filter((m) => m.active);

  return (
    <>
      <PageHeader title="اعضای گروه" back={{ href: `/groups/${groupId}`, label: view.group.name }} />
      <div className="space-y-4">
        <ul className="space-y-2">
          {active.map((m) => (
            <li key={m.id} className="card space-y-2 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {m.name}
                  {m.isMe && " (من)"}
                </span>
                <span className="flex gap-1">
                  {m.isGuest ? <Chip tone="warning">مهمان (بدون حساب)</Chip> : <Chip>{ROLE_LABELS[m.role]}</Chip>}
                </span>
              </div>
              {(admin || m.isMe) && <RenameForm groupId={groupId} memberId={m.id} name={m.name} />}
              {admin && m.isGuest && <ClaimInviteForm groupId={groupId} memberId={m.id} name={m.name} />}
              <div className="flex flex-wrap gap-2">
                {owner && !m.isGuest && m.role !== "owner" && (
                  <ActionButton
                    action={setRoleAction.bind(null, groupId, m.id, m.role === "admin" ? "member" : "admin")}
                    className="btn-secondary min-h-9 px-3 text-xs"
                  >
                    {m.role === "admin" ? "برداشتن مدیریت" : "مدیر شود"}
                  </ActionButton>
                )}
                {m.role !== "owner" && (admin || m.isMe) && (
                  <ActionButton
                    action={removeMemberAction.bind(null, groupId, m.id)}
                    className="btn-danger min-h-9 px-3 text-xs"
                    confirmText={m.isMe ? "از این گروه خارج می‌شوید؟" : `«${m.name}» از گروه خارج شود؟`}
                  >
                    {m.isMe ? "خروج از گروه" : "حذف از گروه"}
                  </ActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>

        {admin && (
          <>
            <section className="card">
              <h2 className="mb-1 font-bold">افزودن عضو مهمان</h2>
              <p className="mb-3 text-xs leading-6 text-muted">
                برای کسی که هنوز در اپ حساب ندارد. می‌توانید برایش هزینه ثبت کنید و بعداً با لینک اختصاصی حسابش را وصل کند.
              </p>
              <AddGuestForm groupId={groupId} />
            </section>
            <section className="card">
              <h2 className="mb-1 font-bold">لینک دعوت عمومی</h2>
              <p className="mb-3 text-xs leading-6 text-muted">
                هر کس با این لینک وارد شود، عضو جدید گروه می‌شود. این لینک نمی‌تواند جای یک عضو مهمان را بگیرد؛ برای مهمان‌ها از
                «لینک اختصاصی» کنار نامشان استفاده کنید.
              </p>
              <GroupInviteForm groupId={groupId} />
            </section>
            {invites.length > 0 && (
              <section className="card">
                <h2 className="mb-2 font-bold">لینک‌های فعال</h2>
                <ul className="space-y-2 text-sm">
                  {invites.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2">
                      <span>
                        {inv.kind === "claim"
                          ? `اختصاصی برای ${view.members.find((m) => m.id === inv.claimMemberId)?.name ?? "—"}`
                          : `عمومی (${new Intl.NumberFormat("fa-IR").format(inv.uses)} بار استفاده)`}
                        <span className="block text-xs text-muted">تا {formatJalaliDateTime(inv.expiresAt)}</span>
                      </span>
                      <form action={revokeInviteAction.bind(null, groupId, inv.id)}>
                        <button className="btn-danger min-h-9 px-3 text-xs">لغو</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
