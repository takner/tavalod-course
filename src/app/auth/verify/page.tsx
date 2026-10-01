import type { Metadata } from "next";
import Link from "next/link";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "تأیید ورود" };

export default async function VerifyPage(props: PageProps<"/auth/verify">) {
  const { token } = await props.searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">ورود به تولد</h1>
      {typeof token === "string" && token ? (
        <>
          <p className="leading-8 text-muted">برای ورود، دکمه زیر را بزنید.</p>
          <VerifyForm token={token} />
        </>
      ) : (
        <>
          <p className="leading-8 text-muted">لینک ورود ناقص است.</p>
          <Link href="/login" className="btn-primary">
            درخواست لینک جدید
          </Link>
        </>
      )}
    </main>
  );
}
