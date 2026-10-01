import Link from "next/link";
import { redirect } from "next/navigation";
import { AppIconArt } from "@/components/AppIcon";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  if (await getCurrentUser()) redirect("/groups");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <AppIconArt size={72} />
      <div>
        <h1 className="text-2xl font-bold leading-10">تولد</h1>
        <p className="mt-2 leading-8 text-muted">
          هماهنگی جمع دوستان، از برنامه‌ریزی تا تسویه: هزینه‌های سفر و دورهمی را ثبت کنید، سهم هر نفر را دقیق ببینید و
          با انتقال کمتر تسویه کنید.
        </p>
      </div>
      <ul className="space-y-2 text-sm leading-7 text-muted">
        <li>• تقسیم مساوی، مبلغ مشخص، درصدی یا سهمی؛ با چند پرداخت‌کننده</li>
        <li>• هر عدد قابل توضیح است: مانده هر نفر قلم‌به‌قلم</li>
        <li>• تسویه فقط با تأیید دریافت‌کننده ثبت می‌شود</li>
        <li>• ثبت هزینه حتی با اینترنت ضعیف</li>
      </ul>
      <Link href="/login" className="btn-primary">
        ورود با ایمیل
      </Link>
    </main>
  );
}
