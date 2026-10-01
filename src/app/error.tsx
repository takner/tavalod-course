"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">خطایی رخ داد</h1>
      <p className="leading-8 text-muted">مشکلی پیش آمد. اگر اینترنت قطع است، بعد از اتصال دوباره تلاش کنید.</p>
      <button type="button" className="btn-primary" onClick={() => reset()}>
        تلاش دوباره
      </button>
    </main>
  );
}
