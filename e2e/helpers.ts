import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const OUTBOX = path.join(process.cwd(), ".e2e-outbox");

/** Latest sign-in link mailed to `email` by the dev server's outbox transport. */
async function latestLinkFor(email: string, after: number): Promise<string> {
  for (let i = 0; i < 50; i++) {
    let files: string[] = [];
    try {
      files = readdirSync(OUTBOX).filter((f) => f.endsWith(".json"));
    } catch {
      /* not created yet */
    }
    const mails = files
      .map((f) => ({ ts: Number(f.split("-")[0]), mail: JSON.parse(readFileSync(path.join(OUTBOX, f), "utf8")) as { to: string; text: string } }))
      .filter((m) => m.mail.to === email && m.ts >= after)
      .sort((a, b) => b.ts - a.ts);
    if (mails.length) return mails[0].mail.text.match(/https?:\/\/\S+/)![0];
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no mail for ${email}`);
}

export async function signIn(page: Page, email: string, name?: string, next?: string) {
  const started = Date.now() - 1000;
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByRole("button", { name: "ارسال لینک ورود" }).click();
  await expect(page.getByText("لینک ورود به ایمیل شما فرستاده شد")).toBeVisible();
  const link = await latestLinkFor(email, started);
  await page.goto(link);
  await page.getByRole("button", { name: "ورود به حساب" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"));
  if (name && page.url().includes("/me")) {
    await page.getByLabel("نام من").fill(name);
    await page.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(page.getByText("نام شما ذخیره شد.")).toBeVisible();
  }
}

export async function createGroup(page: Page, name: string): Promise<string> {
  await page.goto("/groups");
  await page.getByPlaceholder("مثلاً دوستان دانشگاه").fill(name);
  await page.getByRole("button", { name: "ساخت گروه" }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  return page.url().split("/groups/")[1];
}

export async function addGuest(page: Page, groupId: string, name: string) {
  await page.goto(`/groups/${groupId}/members`);
  await page.getByPlaceholder("نام", { exact: true }).fill(name);
  await page.getByRole("button", { name: "افزودن" }).click();
  await expect(page.getByText("عضو مهمان اضافه شد.")).toBeVisible();
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.local`;
}

/** Reads a balance row on the group's balances tab, e.g. "+۵۰۰٬۰۰۰ تومان". */
export async function balanceOf(page: Page, groupId: string, member: string): Promise<string> {
  await page.goto(`/groups/${groupId}?tab=balances`);
  const row = page.getByRole("link").filter({ hasText: member }).first();
  return (await row.innerText()).replace(member, "").replace("(من)", "").replace("· مهمان", "").trim();
}
