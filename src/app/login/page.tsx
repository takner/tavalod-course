import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { safeNextPath } from "@/server/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "ورود" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);
  if (await getCurrentUser()) redirect(nextPath ?? "/groups");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">ورود به تولد</h1>
        <p className="mt-2 leading-8 text-muted">ایمیلتان را وارد کنید تا لینک ورود برایتان فرستاده شود. رمز عبور لازم نیست.</p>
      </div>
      <LoginForm next={nextPath} />
    </main>
  );
}
