import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">پیدا نشد</h1>
      <p className="leading-8 text-muted">این صفحه وجود ندارد یا به آن دسترسی ندارید.</p>
      <Link href="/groups" className="btn-primary">
        رفتن به گروه‌ها
      </Link>
    </main>
  );
}
