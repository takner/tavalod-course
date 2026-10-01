# راهنمای اجرا و نگهداری tavalod

این راهنما برای سرور `deploy@your-server.example` و دامنه `https://tavalod.example.com` نوشته شده است.

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
| `web` | `tavalod-web-1` | اپ Next.js، تنها سرویس متصل به `internal_network` (Traefik) |
| `backup` | `tavalod-backup-1` | `pg_dump` روزانه، نگهداری ۱۴ روز |
| `migrate` | (موقت) | اجرای migrationها؛ فقط هنگام استقرار |

Traefik موجود سرور (`/opt/traefik`) دامنه را با entrypoint `websecure` و certresolver `letsencrypt` به پورت ۳۰۰۰ اپ می‌رساند. انتقال HTTP به HTTPS را خود Traefik به‌صورت سراسری انجام می‌دهد.

همه دستورهای Compose را از پوشه نسخه جاری و با نام پروژه اجرا کنید:

```bash
cd ~/apps/tavalod/current/deploy
C="docker compose -p tavalod -f compose.yml --env-file release.env"
```

## استقرار نسخه جدید (از سیستم توسعه)

```bash
git push
deploy/deploy.sh            # HEAD
deploy/deploy.sh <commit>   # یک commit مشخص (باید push شده باشد)
```

مراحل اسکریپت: بررسی تمیز بودن و push شدن ← انتقال کد با `git archive` ← ساخت image `tavalod:<sha>` روی سرور ← بکاپ پیش از migration ← `migrate` ← بالا آوردن `web` و `backup` ← صبر برای healthy ← بررسی `https://tavalod.example.com/api/health` که باید `release` برابر sha جدید باشد ← به‌روزرسانی `current` و `releases.log`. اگر هر مرحله شکست بخورد، `current` و نسخه قبلی دست نمی‌خورند.

اولین بار (یا روی سرور جدید): `bash deploy/server-init.sh` روی سرور (پوشه‌ها و secrets را می‌سازد؛ فایل موجود را بازنویسی نمی‌کند).

## لاگ و وضعیت

```bash
$C ps
$C logs -f --tail 100 web
$C logs --tail 50 backup
curl -s https://tavalod.example.com/api/health
cat ~/apps/tavalod/ops/releases.log
```

## تنظیم ارسال ایمیل (ورود)

در `~/apps/tavalod/shared/app.env` مقادیر زیر را پر کنید و سپس web را دوباره بسازید:

```
SMTP_HOST=...        # مثلاً smtp.gmail.com یا smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true     # برای پورت 587 مقدار false
SMTP_USER=...
SMTP_PASSWORD=...    # برای Gmail: App Password
EMAIL_FROM="تولد <no-reply@example.com>"
```

```bash
bash ~/apps/tavalod/current/deploy/restart-web.sh
```

در production هیچ‌وقت لینک ورود در لاگ یا فایل نوشته نمی‌شود؛ بدون SMTP، صفحه ورود پیام «ارسال ایمیل هنوز پیکربندی نشده» نشان می‌دهد.

## بکاپ

- خودکار: هر ۲۴ ساعت `backups/tavalod-db-<UTC>.dump`، نگهداری ۱۴ روز.
- پیش از هر migration: `backups/tavalod-predeploy-<sha>-<UTC>.dump` (۱۰ مورد آخر).
- بکاپ دستی:

```bash
$C exec -T db pg_dump -U tavalod -d tavalod -Fc > ~/apps/tavalod/backups/tavalod-manual-$(date -u +%Y%m%dT%H%M%SZ).dump
```

- آزمایش بازیابی (در کانتینر ایزوله و بدون شبکه؛ داده واقعی دست نمی‌خورد):

```bash
bash ~/apps/tavalod/current/deploy/restore-test.sh            # آخرین بکاپ
bash ~/apps/tavalod/current/deploy/restore-test.sh <file>     # بکاپ مشخص
```

بکاپ‌ها روی همین سرور هستند. برای ایمنی در برابر خرابی دیسک، یک نسخه را به‌صورت دوره‌ای به جای دیگری منتقل کنید.

## بازیابی واقعی دیتابیس (تصمیم آگاهانه — داده‌های جدیدتر از بکاپ از بین می‌رود)

```bash
cd ~/apps/tavalod/current/deploy
C="docker compose -p tavalod -f compose.yml --env-file release.env"
$C exec -T db pg_dump -U tavalod -d tavalod -Fc > ~/apps/tavalod/backups/before-restore-$(date -u +%Y%m%dT%H%M%SZ).dump
$C stop web backup
$C exec -T db psql -U tavalod -d postgres -c "drop database tavalod with (force)" -c "create database tavalod owner tavalod"
$C exec -T db pg_restore -U tavalod -d tavalod --no-owner < ~/apps/tavalod/backups/<file>.dump
$C up -d web backup
```

## Rollback کد

```bash
bash ~/apps/tavalod/current/deploy/rollback.sh          # نسخه قبلی
bash ~/apps/tavalod/current/deploy/rollback.sh <sha>    # نسخه مشخص
```

Rollback فقط کد را برمی‌گرداند. migrationها فقط رو به جلو و افزایشی‌اند (expand/contract)، پس کد قدیمی با schema جدید کار می‌کند. هرگز ستونی را در همان نسخه‌ای که استفاده از آن حذف می‌شود، drop نکنید.

## نکات ایمنی

- به Traefik، فایروال و کانتینرهای پروژه‌های دیگر دست نزنید؛ از `docker system prune` یا توقف سراسری استفاده نکنید.
- پاک‌سازی imageهای قدیمی tavalod را `deploy.sh` فقط برای imageهای `tavalod:*` انجام می‌دهد.
- secrets فقط در `shared/*.env` روی سرور هستند.
