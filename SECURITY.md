# Security policy / سیاست امنیتی

این مخزن یک پروژه آموزشی است. اگر آسیب‌پذیری امنیتی پیدا کردید (مثلاً راهی برای دیدن اطلاعات فضای خصوصی سورپرایز توسط صاحب تولد، دور زدن مجوزها یا دستکاری حساب‌ها):

- **آن را در Issue عمومی ننویسید.** از گزینه «Report a vulnerability» در تب Security همین مخزن (GitHub private vulnerability reporting) استفاده کنید.
- مراحل بازتولید، مسیر/درخواست دقیق و اثر آن را بنویسید. اگر بتوانید یک تست خودکار که مشکل را نشان می‌دهد هم اضافه کنید، عالی است.
- فقط روی نسخه محلی خودتان آزمایش کنید؛ به سرورهای دیگران حمله نکنید و داده واقعی کسی را برندارید.

If you find a vulnerability, please report it privately through GitHub's "Report a vulnerability" (Security tab), not in a public issue. Only test against your own local instance.

## Secrets
هیچ secret واقعی نباید وارد Git شود. فایل‌های `.env*` (به‌جز `.env.example`) و `deploy/deploy.env` در `.gitignore` هستند و GitHub Push Protection جلوی push بیشتر کلیدها را می‌گیرد. اگر اشتباهاً secretی را commit کردید، آن را فوراً باطل/عوض کنید؛ پاک کردن از تاریخچه کافی نیست.
