import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { toAppError } from "@/server/errors";
import { previewInvite, type InvitePreview } from "@/server/groups";
import { AcceptInvite } from "./AcceptInvite";

export const metadata: Metadata = { title: "دعوت" };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const user = await getCurrentUser();
  let preview: InvitePreview | null = null;
  let problem: string | null = null;
  try {
    preview = await previewInvite(user ? { userId: user.id } : null, token);
  } catch (err) {
    problem = toAppError(err).message;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6">
      <h1 className="text-2xl font-bold">دعوت به گروه</h1>
      {problem || !preview ? (
        <Notice tone="error">{problem ?? "این لینک دعوت معتبر نیست."}</Notice>
      ) : (
        <>
          <p className="leading-8">
            شما به گروه «<strong>{preview.groupName}</strong>» دعوت شده‌اید.
            {preview.kind === "claim" && preview.guestName && (
              <>
                {" "}
                این لینک اختصاصی است و حساب شما را به عضو «<strong>{preview.guestName}</strong>» و همه هزینه‌های ثبت‌شده او
                وصل می‌کند.
              </>
            )}
          </p>
          {!user ? (
            <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="btn-primary">
              ابتدا وارد شوید
            </Link>
          ) : preview.alreadyMember ? (
            <Link href={`/groups/${preview.groupId}`} className="btn-primary">
              شما عضو این گروه هستید — رفتن به گروه
            </Link>
          ) : (
            <AcceptInvite
              token={token}
              label={preview.kind === "claim" ? `بله، من ${preview.guestName} هستم` : "پیوستن به گروه"}
            />
          )}
        </>
      )}
    </main>
  );
}
