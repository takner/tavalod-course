# راهنمای اجرا و نگهداری tavalod

این راهنما با مقادیر نمونه نوشته شده است: سرور `deploy@your-server.example`، مسیر `/home/deploy/apps/tavalod` و دامنه `https://tavalod.example.com`. مقادیر سرور خودتان را در `deploy/deploy.env` بنویسید (نمونه: `deploy/deploy.env.example`؛ این فایل در Git نیست).

## پیش‌نیازهای سرور

- لینوکس با Docker و Docker Compose، کاربری عضو گروه `docker` با ورود SSH فقط با کلید.
- یک Traefik در حال اجرا با شبکه Docker مشترک، entrypoint روی ۴۴۳ و certresolver (مثلاً Let's Encrypt). نام‌های واقعی را از تنظیمات Traefik خودتان در `deploy/deploy.env` بنویسید (`TRAEFIK_NETWORK`، `TRAEFIK_ENTRYPOINT`، `TRAEFIK_CERTRESOLVER`).
- رکورد DNS از نوع A برای دامنه که به IP سرور اشاره کند.

## ساختار روی سرور

```
/home/deploy/apps/tavalod/
  releases/<sha>/     کد هر نسخه (از git archive) — ۵ نسخه آخر نگه داشته می‌شود
  current -> releases/<sha>   نسخه در حال اجرا
  shared/app.env      تنظیمات و secrets اپ (chmod 600، هرگز در Git نیست)
  shared/db.env       رمز دیتابیس (chmod 600)
  backups/            بکاپ روزانه + بکاپ پیش از هر migration
  ops/releases.log    تاریخچه استقرار و rollback
```

پروژه Compose: `tavalod` — سرویس‌ها:

| سرویس | کانتینر | توضیح |
|---|---|---|
| `db` | `tavalod-db-1` | PostgreSQL 16، volume `tavalod_pgdata`، فقط روی شبکه داخلی (بدون اینترنت و بدون پورت باز) |
| `web` | `tavalod-web-1` | اپ Next.js، تنها سرویس متصل به شبکه Traefik (`TRAEFIK_NETWORK`) |
| `backup` | `tavalod-backup-1` | `pg_dump` روزانه، نگهداری ۱۴ روز |
| `migrate` | (موقت) | اجرای migrationها؛ فقط هنگام استقرار |

Traefik سرور دامنه را با entrypoint و certresolver تنظیم‌شده به پورت ۳۰۰۰ اپ می‌رساند. انتقال HTTP به HTTPS را بهتر است خود Traefik به‌صورت سراسری انجام دهد.

همه دستورهای Compose را از پوشه نسخه جاری و با نام پروژه اجرا کنید:

```bash
cd /home/deploy/apps/tavalod/current/deploy
C="docker compose -p tavalod -f compose.yml --env-file release.env"
```

## استقرار نسخه جدید (از سیستم توسعه)

```bash
cp deploy/deploy.env.example deploy/deploy.env   # یک بار؛ مقادیر سرور خودتان
deploy/deploy.sh init       # یک بار برای هر سرور: پوشه‌ها و secrets
git push
deploy/deploy.sh            # HEAD
deploy/deploy.sh <commit>   # یک commit مشخص (باید push شده باشد)
```

مراحل اسکریپت: بررسی تمیز بودن و push شدن ← انتقال کد با `git archive` ← ساخت image `tavalod:<sha>` روی سرور ← بکاپ پیش از migration ← `migrate` ← بالا آوردن `web` و `backup` ← صبر برای healthy ← بررسی `https://tavalod.example.com/api/health` که باید `release` برابر sha جدید باشد ← به‌روزرسانی `current` و `releases.log`. اگر هر مرحله شکست بخورد، `current` و نسخه قبلی دست نمی‌خورند.

`deploy/deploy.sh init` اسکریپت `deploy/server-init.sh` را روی سرور اجرا می‌کند: پوشه‌ها را می‌سازد و رمز دیتابیس را روی خود سرور تولید می‌کند (چاپ نمی‌شود و فایل موجود را بازنویسی نمی‌کند). تنظیمات هر نسخه در `release.env` همان نسخه ثبت می‌شود و اسکریپت‌های rollback/restart/restore-test از آن می‌خوانند.

## لاگ و وضعیت

```bash
$C ps
$C logs -f --tail 100 web
$C logs --tail 50 backup
curl -s https://tavalod.example.com/api/health
cat /home/deploy/apps/tavalod/ops/releases.log
```

## تنظیم ارسال ایمیل (ورود)

در `/home/deploy/apps/tavalod/shared/app.env` مقادیر زیر را پر کنید و سپس web را دوباره بسازید:

```
SMTP_HOST=...        # مثلاً smtp.gmail.com یا smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true     # برای پورت 587 مقدار false
SMTP_USER=...
SMTP_PASSWORD=...    # برای Gmail: App Password
EMAIL_FROM="تولد <no-reply@example.com>"
```

```bash
bash /home/deploy/apps/tavalod/current/deploy/restart-web.sh
```

اپ هیچ‌وقت لینک‌های ورودِ ایمیلی را در لاگ یا فایل نمی‌نویسد؛ بدون SMTP، صفحه ورود می‌گوید ورود با ایمیل فعال نیست و لینک را از مدیر بگیرید.

## ورود بدون ایمیل (لینک شخصی صادرشده توسط مدیر)

تا وقتی SMTP تنظیم نشده، برای هر نفر یک لینک ورود شخصی بسازید و خصوصی برایش بفرستید (مثلاً در پیام‌رسان):

```bash
cd /home/deploy/apps/tavalod/current/deploy
(umask 077; docker compose -p tavalod -f compose.yml --env-file release.env exec -T web \
  node scripts/issue-login.mjs --days 7 --uses 3 "علی" "سارا" >> /home/deploy/apps/tavalod/shared/login-links.txt)
cat /home/deploy/apps/tavalod/shared/login-links.txt
```

- هر خط: نام، ایمیل (برای افراد بدون ایمیل یک آدرس جایگزین `…@login.tavalod.invalid`)، لینک.
- لینک تا `--days` روز و حداکثر `--uses` بار کار می‌کند (مثلاً یک بار در مرورگر و یک بار در اپ نصب‌شده روی آیفون که کوکی جدا دارد). هر ورود ۳۰ روز معتبر است. بعد از ورود، شخص به «حساب من» می‌رود تا نامش را تنظیم کند.
- لینک جدید برای همان حساب: `"نام:ایمیل-همان-خط"`.
- لینک‌ها مثل رمز عبورند؛ فقط برای خود شخص بفرستید و بعد از ارسال، فایل را پاک کنید: `rm /home/deploy/apps/tavalod/shared/login-links.txt`.
- این ابزار فقط با دسترسی SSH به سرور اجرا می‌شود و از وب قابل دسترسی نیست.

## بکاپ

- خودکار: هر ۲۴ ساعت `backups/tavalod-db-<UTC>.dump`، نگهداری ۱۴ روز.
- پیش از هر migration: `backups/tavalod-predeploy-<sha>-<UTC>.dump` (۱۰ مورد آخر).
- بکاپ دستی:

```bash
$C exec -T db pg_dump -U tavalod -d tavalod -Fc > /home/deploy/apps/tavalod/backups/tavalod-manual-$(date -u +%Y%m%dT%H%M%SZ).dump
```

- آزمایش بازیابی (در کانتینر ایزوله و بدون شبکه؛ داده واقعی دست نمی‌خورد):

```bash
bash /home/deploy/apps/tavalod/current/deploy/restore-test.sh            # آخرین بکاپ
bash /home/deploy/apps/tavalod/current/deploy/restore-test.sh <file>     # بکاپ مشخص
```

بکاپ‌ها روی همین سرور هستند. برای ایمنی در برابر خرابی دیسک، یک نسخه را به‌صورت دوره‌ای به جای دیگری منتقل کنید.

## بازیابی واقعی دیتابیس (تصمیم آگاهانه — داده‌های جدیدتر از بکاپ از بین می‌رود)

```bash
cd /home/deploy/apps/tavalod/current/deploy
C="docker compose -p tavalod -f compose.yml --env-file release.env"
$C exec -T db pg_dump -U tavalod -d tavalod -Fc > /home/deploy/apps/tavalod/backups/before-restore-$(date -u +%Y%m%dT%H%M%SZ).dump
$C stop web backup
$C exec -T db psql -U tavalod -d postgres -c "drop database tavalod with (force)" -c "create database tavalod owner tavalod"
$C exec -T db pg_restore -U tavalod -d tavalod --no-owner < /home/deploy/apps/tavalod/backups/<file>.dump
$C up -d web backup
```

## Rollback کد

```bash
bash /home/deploy/apps/tavalod/current/deploy/rollback.sh          # نسخه قبلی
bash /home/deploy/apps/tavalod/current/deploy/rollback.sh <sha>    # نسخه مشخص
```

**محافظ سازگاری:** نسخه‌های قبل از مرحله ۲ (بدون migration `0004`) فضای خصوصی سورپرایز را نمی‌شناسند و اگر اجرا شوند، هزینه‌های خصوصی را در مانده عمومی گروه نشان می‌دهند. `rollback.sh` قبل از بازگشت به چنین نسخه‌ای داده واقعی را بررسی می‌کند و اگر هزینه یا پرداخت خصوصی وجود داشته باشد، بازگشت را رد می‌کند (کد خروج ۲). در آن حالت به‌جای rollback، اصلاح را رو به جلو مستقر کنید.

Rollback فقط کد را برمی‌گرداند. migrationها فقط رو به جلو و افزایشی‌اند (expand/contract)، پس کد قدیمی با schema جدید کار می‌کند. هرگز ستونی را در همان نسخه‌ای که استفاده از آن حذف می‌شود، drop نکنید.

## نکات ایمنی

- به Traefik، فایروال و کانتینرهای پروژه‌های دیگر دست نزنید؛ از `docker system prune` یا توقف سراسری استفاده نکنید.
- پاک‌سازی imageهای قدیمی tavalod را `deploy.sh` فقط برای imageهای `tavalod:*` انجام می‌دهد.
- secrets فقط در `shared/*.env` روی سرور هستند.
