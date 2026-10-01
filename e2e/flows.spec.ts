import { expect, test } from "@playwright/test";
import { addGuest, balanceOf, createGroup, signIn, uniqueEmail } from "./helpers";

test("trip with unequal nights: weighted split, explanation, settle-up, close event", async ({ page }) => {
  await signIn(page, uniqueEmail("ali"), "علی");
  const groupId = await createGroup(page, "سفر شمال");
  await addGuest(page, groupId, "سارا");
  await addGuest(page, groupId, "مینا");

  await page.goto(`/groups/${groupId}/events/new`);
  await page.getByLabel("عنوان").fill("ویلای رامسر");
  await page.getByRole("button", { name: "ساخت رویداد" }).click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const eventUrl = page.url();

  // Villa 1,000,000: Ali and Sara stayed 2 nights, Mina 1 night → weights 2:2:1.
  await page.getByRole("link", { name: "+ هزینه" }).click();
  await page.getByLabel("عنوان").fill("ویلا");
  await page.getByLabel("مبلغ کل").fill("۱۰۰۰۰۰۰");
  await page.getByRole("radio", { name: "سهمی (وزنی)" }).click();
  await page.getByLabel("سهم هر نفر (مثلاً تعداد شب) — علی").fill("2");
  await page.getByLabel("سهم هر نفر (مثلاً تعداد شب) — سارا").fill("2");
  await page.getByLabel("سهم هر نفر (مثلاً تعداد شب) — مینا").fill("1");
  await expect(page.getByTestId("share-مینا")).toHaveText("۲۰۰٬۰۰۰ تومان");
  await page.getByRole("button", { name: "ثبت هزینه" }).click();
  await page.waitForURL(/\/expenses\/[0-9a-f-]{36}$/);
  await expect(page.getByText("سهمی (وزنی)")).toBeVisible();

  expect(await balanceOf(page, groupId, "علی")).toBe("+۶۰۰٬۰۰۰ تومان");
  expect(await balanceOf(page, groupId, "سارا")).toBe("−۴۰۰٬۰۰۰ تومان");
  expect(await balanceOf(page, groupId, "مینا")).toBe("−۲۰۰٬۰۰۰ تومان");

  // Every number is explainable: Mina's line items add up to her balance.
  await page.getByRole("link").filter({ hasText: "مینا" }).first().click();
  await expect(page.getByText("پرداخت ۰ تومان − سهم ۲۰۰٬۰۰۰ تومان")).toBeVisible();

  // Settle with the suggestions; Ali (receiver) records them, so they are confirmed immediately.
  await page.goto(`/groups/${groupId}?tab=balances`);
  await expect(page.getByText("پیشنهاد تسویه با انتقال کمتر")).toBeVisible();
  for (const from of ["سارا", "مینا"]) {
    await page.goto(`/groups/${groupId}?tab=balances`);
    await page.getByRole("listitem").filter({ hasText: `${from} ← به علی` }).getByRole("link").click();
    await page.waitForURL(/\/settle\?/);
    await page.getByRole("button", { name: "دریافت کردم" }).click();
    await expect(page.getByText("تسویه ثبت و تأیید شد.")).toBeVisible();
  }
  expect(await balanceOf(page, groupId, "سارا")).toBe("۰ تومان");

  await page.goto(eventUrl);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "بستن رویداد" }).click();
  await expect(page.getByText("بسته‌شده").first()).toBeVisible();
});

test("two real users: payment stays pending until the receiver confirms", async ({ browser }) => {
  const aliCtx = await browser.newContext();
  const saraCtx = await browser.newContext();
  const ali = await aliCtx.newPage();
  const sara = await saraCtx.newPage();

  await signIn(ali, uniqueEmail("ali"), "علی");
  const groupId = await createGroup(ali, "خانه");
  await ali.goto(`/groups/${groupId}/members`);
  await ali.getByRole("button", { name: "ساخت لینک دعوت" }).click();
  const link = await ali.locator("input[readonly]").inputValue();

  await signIn(sara, uniqueEmail("sara"), "سارا");
  await sara.goto(link);
  await sara.getByRole("button", { name: "پیوستن به گروه" }).click();
  await sara.waitForURL(new RegExp(`/groups/${groupId}$`));

  // Ali pays 300,000 for both.
  await ali.goto(`/groups/${groupId}/expenses/new`);
  await ali.getByLabel("عنوان").fill("خرید خانه");
  await ali.getByLabel("مبلغ کل").fill("300000");
  await ali.getByRole("button", { name: "ثبت هزینه" }).click();
  await ali.waitForURL(/\/expenses\//);

  // Sara reports a partial payment of 100,000.
  await sara.goto(`/groups/${groupId}/settle`);
  await sara.getByLabel("مبلغ").fill("100000");
  await sara.getByRole("button", { name: "پرداخت کردم" }).click();
  await expect(sara.getByText("در انتظار تأیید دریافت‌کننده")).toBeVisible();
  expect(await balanceOf(sara, groupId, "سارا")).toBe("−۱۵۰٬۰۰۰ تومان");

  await ali.goto(`/groups/${groupId}`);
  const box = ali.getByTestId("needs-confirmation");
  await expect(box).toContainText("۱۰۰٬۰۰۰ تومان");
  await box.getByRole("button", { name: "دریافت کردم" }).click();
  await expect(ali.getByTestId("needs-confirmation")).toHaveCount(0);
  expect(await balanceOf(ali, groupId, "سارا")).toBe("−۵۰٬۰۰۰ تومان");

  await aliCtx.close();
  await saraCtx.close();
});

test("offline expense is queued on the device and synced exactly once", async ({ page, context }) => {
  await signIn(page, uniqueEmail("reza"), "رضا");
  const groupId = await createGroup(page, "کوه");
  await addGuest(page, groupId, "نیما");

  await page.goto(`/groups/${groupId}/expenses/new`);
  await page.getByLabel("عنوان").fill("نان و پنیر");
  await page.getByLabel("مبلغ کل").fill("80000");

  // The first attempt reaches the server but the response is lost, then we are fully offline.
  let dropped = false;
  await page.route("**/api/sync", async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch(); // server stores it…
      await context.setOffline(true);
      return route.abort("internetdisconnected"); // …but the phone never hears back
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "ثبت هزینه" }).click();
  await expect(page.getByText("هزینه روی همین دستگاه ذخیره شد")).toBeVisible();
  await expect(page.getByTestId("pending-ops")).toContainText("نان و پنیر");

  // Back online → the queue is replayed; the server recognises the key and does not duplicate.
  await context.setOffline(false);
  await expect(page.getByTestId("pending-ops")).toHaveCount(0, { timeout: 30_000 });

  await page.goto(`/groups/${groupId}?tab=activity`);
  await expect(page.getByText("هزینه «نان و پنیر» به مبلغ ۸۰٬۰۰۰ تومان را ثبت کرد.")).toHaveCount(1);
  expect(await balanceOf(page, groupId, "نیما")).toBe("−۴۰٬۰۰۰ تومان");
});

test("signing out removes this account's offline data; the next account cannot see it", async ({ page, context }) => {
  const first = uniqueEmail("first");
  await signIn(page, first, "اولی");
  const groupId = await createGroup(page, "تست جابه‌جایی حساب");
  await page.goto(`/groups/${groupId}/expenses/new`);
  await page.getByLabel("عنوان").fill("قلم خصوصی");
  await page.getByLabel("مبلغ کل").fill("5000");
  await context.setOffline(true);
  await page.getByRole("button", { name: "ثبت هزینه" }).click();
  await expect(page.getByTestId("pending-ops")).toContainText("قلم خصوصی");
  const dbsBefore = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbsBefore.some((n) => n?.startsWith("tavalod-"))).toBe(true);

  await context.setOffline(false);
  // Stop the queue from syncing so we test the sign-out path with unsent data.
  await page.route("**/api/sync", (route) => route.abort());
  await page.goto("/me");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "خروج از حساب" }).click();
  await page.waitForURL(/\/login/);
  const dbsAfter = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbsAfter.filter((n) => n?.startsWith("tavalod-"))).toEqual([]);

  await page.unroute("**/api/sync");
  await signIn(page, uniqueEmail("second"), "دومی");
  await page.goto("/groups");
  await expect(page.getByText("قلم خصوصی")).toHaveCount(0);
  await expect(page.getByText("تست جابه‌جایی حساب")).toHaveCount(0);
});

test("guest claim link binds the guest exactly once", async ({ browser }) => {
  const aliCtx = await browser.newContext();
  const minaCtx = await browser.newContext();
  const ali = await aliCtx.newPage();
  const mina = await minaCtx.newPage();
  const minaEmail = uniqueEmail("mina");

  await signIn(ali, uniqueEmail("ali"), "علی");
  const groupId = await createGroup(ali, "تولد مینا");
  await addGuest(ali, groupId, "مینا");
  await ali.goto(`/groups/${groupId}/expenses/new`);
  await ali.getByLabel("عنوان").fill("کیک");
  await ali.getByLabel("مبلغ کل").fill("400000");
  await ali.getByRole("button", { name: "ثبت هزینه" }).click();
  await ali.waitForURL(/\/expenses\//);

  await ali.goto(`/groups/${groupId}/members`);
  await ali.getByRole("button", { name: "لینک اختصاصی اتصال حساب برای مینا" }).click();
  await ali.getByLabel(/ایمیل مینا/).fill(minaEmail);
  await ali.getByRole("button", { name: "ساخت لینک یک‌بارمصرف" }).click();
  const claimLink = await ali.locator("input[readonly]").inputValue();

  await signIn(mina, minaEmail, "مینا", new URL(claimLink).pathname);
  await mina.goto(claimLink);
  await expect(mina.getByText("حساب شما را به عضو «مینا»")).toBeVisible();
  await mina.getByRole("button", { name: "بله، من مینا هستم" }).click();
  await mina.waitForURL(new RegExp(`/groups/${groupId}$`));
  await expect(mina.getByText("−۲۰۰٬۰۰۰ تومان").first()).toBeVisible();

  // Single use.
  await mina.goto(claimLink);
  await expect(mina.getByText(/قبلاً استفاده شده|عضو این گروه هستید/)).toBeVisible();

  await aliCtx.close();
  await minaCtx.close();
});

test("health endpoint and security basics", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
  expect(res.headers()["cache-control"]).toContain("no-store");

  const sync = await request.post("/api/sync", { data: { ops: [] }, headers: { origin: "https://evil.example" } });
  expect(sync.status()).toBe(403);

  const page = await request.get("/groups");
  expect(page.url()).toContain("/login");
});
