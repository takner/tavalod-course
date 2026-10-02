import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/**
 * Full birthday scenario with four people: organiser Ali, friends Sara and Reza, and Mina whose
 * birthday it is. Runs locally (sign-in through the dev outbox) or against production when
 * E2E_LINKS_FILE points at operator-issued links for disposable test accounts.
 */
const SHOTS = process.env.E2E_SCREENSHOTS_DIR;
const LINKS_FILE = process.env.E2E_LINKS_FILE;
const links: Record<string, string> = LINKS_FILE
  ? Object.fromEntries(
      readFileSync(LINKS_FILE, "utf8")
        .trim()
        .split("\n")
        .map((l) => l.split("\t"))
        .map(([name, , link]) => [name, link]),
    )
  : {};
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  // Full-page captures: let the fixed tab bar sit at the end instead of over the middle.
  await page.addStyleTag({ content: 'nav[aria-label="ناوبری اصلی"]{position:static!important}' });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function person(browser: Browser, key: string, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (LINKS_FILE) {
    await page.goto(links[key]);
    await page.getByRole("button", { name: "ورود به حساب" }).click();
    await page.waitForURL(/\/me/);
    await page.getByLabel("نام من").fill(name);
    await page.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(page.getByText("نام شما ذخیره شد.")).toBeVisible();
  } else {
    await signIn(page, uniqueEmail(key), name);
  }
  return page;
}

test("birthday from wishlist to surprise gift, without the celebrant learning anything", async ({ browser }) => {
  test.setTimeout(240_000);
  const ali = await person(browser, "ali", "علی");
  const sara = await person(browser, "sara", "سارا");
  const reza = await person(browser, "reza", "رضا");
  const mina = await person(browser, "mina", "مینا");

  // ── group & invitations ──
  await ali.goto("/groups");
  await ali.getByPlaceholder("مثلاً دوستان دانشگاه").fill("بچه‌های آزمایشی تولد");
  await ali.getByRole("button", { name: "ساخت گروه" }).click();
  await ali.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupId = ali.url().split("/groups/")[1];
  await ali.goto(`/groups/${groupId}/members`);
  await ali.getByRole("button", { name: "ساخت لینک دعوت" }).click();
  const invite = await ali.locator("input[readonly]").inputValue();
  for (const p of [sara, reza, mina]) {
    await p.goto(invite);
    await p.getByRole("button", { name: "پیوستن به گروه" }).click();
    await p.waitForURL(new RegExp(`/groups/${groupId}$`));
  }

  // ── Mina: birthday + wishlist shared with the group ──
  await mina.goto("/me");
  await mina.getByLabel("تقویم").selectOption("jalali");
  await mina.getByLabel("ماه").selectOption("8");
  await mina.getByLabel("روز").fill("12");
  await mina.getByRole("button", { name: "ذخیره تاریخ تولد" }).click();
  await expect(mina.getByText("تاریخ تولد ذخیره شد.")).toBeVisible();
  await mina.goto("/wishlists");
  await mina.getByLabel("عنوان", { exact: true }).fill("آرزوهای تولدم");
  await mina.getByLabel(/بچه‌های آزمایشی تولد/).check();
  await mina.getByRole("button", { name: "ساخت فهرست" }).click();
  await mina.waitForURL(/\/wishlists\/[0-9a-f-]{36}$/);
  await mina.getByRole("link", { name: "+ افزودن آیتم" }).click();
  await mina.waitForURL(/\/items\/new$/);
  await mina.getByLabel("عنوان", { exact: true }).fill("هدفون بی‌سیم");
  await mina.getByLabel("برند", { exact: true }).fill("سونی");
  await mina.getByLabel("مدل دقیق", { exact: true }).fill("WH-1000XM5");
  await mina.getByLabel("رنگ", { exact: true }).fill("مشکی");
  await mina.getByLabel("لینک کالا یا فروشگاه").fill("https://example.com/headphones");
  await mina.locator("#it-price").fill("۹۰۰۰۰۰۰");
  await mina.locator("#image-file").setInputFiles({ name: "h.png", mimeType: "image/png", buffer: PNG_1x1 });
  await mina.getByLabel("کالای مشابه (برند یا مدل دیگر) هم قبول است").check();
  await mina.getByRole("button", { name: "افزودن به فهرست" }).click();
  await mina.waitForURL(/\/wishlists\/[0-9a-f-]{36}$/);
  await expect(mina.getByText("WH-1000XM5")).toBeVisible();
  await shot(mina, "01-wishlist-owner");

  // ── Ali: create the birthday (event + surprise space + checklist) ──
  await ali.goto(`/groups/${groupId}`);
  await expect(ali.getByText("تولدهای پیش رو")).toBeVisible();
  await shot(ali, "02-group");
  await ali.goto(`/groups/${groupId}/birthdays/new`);
  await ali.getByLabel("تولد چه کسی؟").selectOption({ label: "مینا" });
  await ali.getByLabel("ساعت (اختیاری، به وقت تهران)").fill("19:30");
  await ali.getByRole("button", { name: "ساخت تولد" }).click();
  await ali.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const eventUrl = new URL(ali.url()).pathname;
  await expect(ali.getByText(/ساعت ۱۹:۳۰/)).toBeVisible();

  // details: place, map, budget
  await ali.getByRole("link", { name: "ویرایش جزئیات" }).click();
  await ali.getByLabel("نام مکان").fill("خانه علی");
  await ali.getByLabel("لینک نقشه").fill("https://maps.example.com/p/123");
  await ali.locator("#budget-food").fill("2000000");
  await ali.locator("#budget-cake").fill("1500000");
  await ali.getByRole("button", { name: "ذخیره" }).click();
  await ali.waitForURL(new RegExp(`${eventUrl}$`));

  // RSVPs: 3 going (Ali already going), Reza brings 1 adult + 2 children
  await sara.goto(eventUrl);
  await sara.getByRole("button", { name: "ثبت پاسخ" }).click();
  await expect(sara.getByText("پاسخ حضور ثبت شد.")).toBeVisible();
  await reza.goto(eventUrl);
  await reza.getByLabel("بزرگسال همراه").fill("1");
  await reza.getByLabel("کودک همراه").fill("2");
  await reza.getByRole("button", { name: "ثبت پاسخ" }).click();
  await expect(reza.getByText("پاسخ حضور ثبت شد.")).toBeVisible();

  // cake estimate: 4 adults (Ali, Sara, Reza +1) × 150 + 2 children × 100 = 800g → +10% 880 → 1 kg
  await ali.goto(`${eventUrl}/cake`);
  await expect(ali.getByTestId("cake-result")).toContainText("۸۰۰ گرم");
  await expect(ali.getByTestId("cake-result")).toContainText("۱ کیلو");
  await shot(ali, "05-cake");

  // ── poll: pick a time ──
  await ali.goto(`/groups/${groupId}/polls/new?eventId=${eventUrl.split("/").pop()}`);
  await ali.getByLabel("سؤال", { exact: true }).fill("کدام شب؟");
  await ali.getByRole("button", { name: "ساخت نظرسنجی" }).click();
  await ali.waitForURL(/\/polls\/[0-9a-f-]{36}$/);
  const pollUrl = new URL(ali.url()).pathname;
  await sara.goto(pollUrl);
  await sara.locator('input[name="option"]').first().check();
  await sara.getByRole("button", { name: "ثبت رأی" }).click();
  await expect(sara.getByText("رأی شما ثبت شد.")).toBeVisible();
  await sara.getByRole("button", { name: "به‌روزرسانی رأی" }).click(); // re-send: still one ballot
  await expect(sara.getByTestId("poll-results")).toContainText("۱ نفر از ۴ نفر پاسخ داده‌اند");
  await shot(sara, "06-poll");

  // ── surprise space: gift from Mina's wishlist ──
  await ali.goto(eventUrl);
  await expect(ali.getByTestId("next-actions")).toBeVisible();
  await shot(ali, "03-event-organiser");
  await ali.getByRole("link", { name: /فضای خصوصی: سورپرایز/ }).first().click();
  await ali.waitForURL(/\/spaces\/[0-9a-f-]{36}$/);
  const spaceUrl = new URL(ali.url()).pathname;
  await ali.getByRole("link", { name: "+ هدیه" }).click();
  await ali.getByLabel("از ویش‌لیست (اختیاری)").selectOption({ index: 1 });
  await ali.getByLabel("عنوان هدیه", { exact: true }).fill("هدفون مینا");
  await ali.locator("#gf-budget").fill("900000");
  await ali.getByLabel(/مینا/).count().then((n) => expect(n).toBe(0)); // celebrant is not offered
  await ali.getByRole("button", { name: "ساخت هدیه" }).click();
  await ali.waitForURL(/\/gifts\/[0-9a-f-]{36}$/);
  const giftUrl = new URL(ali.url()).pathname;

  for (const p of [ali, sara, reza]) {
    await p.goto(giftUrl);
    await p.getByRole("button", { name: "قبول سهم پیشنهادی" }).click();
    await expect(p.getByText("تعهد شما ثبت شد")).toBeVisible();
  }
  // Pledges alone: nothing collected.
  await expect(reza.getByTestId("gift-money")).toContainText("۹۰۰٬۰۰۰ تومان");

  // Sara hands her share to Ali; it is pending until Ali confirms.
  await sara.goto(giftUrl);
  await sara.getByRole("button", { name: "پرداخت کردم" }).click();
  await expect(sara.getByText("تا تأیید دریافت‌کننده «وصول‌شده» حساب نمی‌شود")).toBeVisible();
  await ali.goto(giftUrl);
  await ali.getByRole("button", { name: "دریافت کردم" }).first().click();
  await ali.waitForTimeout(500);
  await ali.goto(giftUrl);
  await expect(ali.getByTestId("gift-money")).toContainText("۳۰۰٬۰۰۰ تومان");

  // Purchase cheaper than budget: 840,000 → 280,000 each; Sara overpaid 20,000.
  await ali.locator("#pur-total").fill("840000");
  await ali.locator("#receipt-file").setInputFiles({ name: "r.png", mimeType: "image/png", buffer: PNG_1x1 });
  await ali.getByRole("button", { name: "ثبت خرید" }).click();
  await expect(ali.getByText("خرید ثبت شده است")).toBeVisible();
  await ali.goto(giftUrl);
  await expect(ali.getByText("طلبکار ۲۰٬۰۰۰")).toBeVisible();
  await expect(ali.getByText("بدهکار ۲۸۰٬۰۰۰")).toHaveCount(2); // Reza (paid nothing) and Ali's own share
  await shot(ali, "04-gift");
  await ali.goto(spaceUrl);
  await shot(ali, "07-space");

  // Reza sees the wishlist item as reserved for the group gift.
  await reza.goto(`/groups/${groupId}/wishlists`);
  await reza.getByRole("link", { name: /آرزوهای تولدم/ }).click();
  await expect(reza.getByText(/خریداری‌شده توسط/)).toBeVisible();
  await shot(reza, "08-wishlist-viewer");

  // ── Mina (celebrant) learns nothing ──
  await mina.goto(eventUrl);
  await expect(mina.getByText("فضای خصوصی")).toHaveCount(0);
  await expect(mina.getByText("هدفون مینا")).toHaveCount(0);
  const minaHtml = await mina.content();
  expect(minaHtml).not.toContain("هدفون مینا");
  expect(minaHtml).not.toContain("سورپرایز");
  await shot(mina, "09-event-celebrant");
  for (const path of [spaceUrl, giftUrl, pollUrl.replace(/polls\/.*/, "polls/00000000-0000-0000-0000-000000000000")]) {
    const res = await mina.goto(path);
    expect(res?.status()).toBe(404);
  }
  const rsc = await mina.request.get(giftUrl, { headers: { RSC: "1" } });
  expect(await rsc.text()).not.toContain("هدفون مینا");
  await mina.goto(`/groups/${groupId}/wishlists`);
  await mina.getByRole("link", { name: /آرزوهای تولدم/ }).click();
  await expect(mina.getByText(/رزرو|خریداری‌شده/)).toHaveCount(1); // only the explanatory notice
  await mina.goto("/notifications");
  expect(await mina.content()).not.toContain("هدفون مینا");
  await mina.goto(`/groups/${groupId}?tab=activity`);
  expect(await mina.content()).not.toContain("هدفون مینا");
  await mina.goto(`/groups/${groupId}?tab=balances`);
  await expect(mina.getByText("همه حساب‌ها تسویه است.")).toBeVisible();

  for (const p of [ali, sara, reza, mina]) await p.context().close();
});
