import type { Metadata } from "next";

export const metadata: Metadata = { title: "آفلاین" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">اتصال اینترنت برقرار نیست</h1>
      <p className="leading-8 text-muted">
        مواردی که در حالت آفلاین ثبت کرده‌اید روی همین دستگاه نگه داشته می‌شوند و با برگشت اینترنت خودکار ارسال
        می‌شوند. برای دیدن آخرین وضعیت حساب‌ها، دوباره به اینترنت وصل شوید.
      </p>
      {/* A full page load is intended here: the offline page is served by the service worker. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/groups" className="btn-primary">
        تلاش دوباره
      </a>
    </main>
  );
}
