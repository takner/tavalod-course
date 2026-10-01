import { and, count, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { loginTokens, sessions, users } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { AppError, invalid } from "./errors";
import { displayName, email as emailSchema } from "./inputs";
import { isEmailConfigured, sendMail } from "./mailer";

export const LOGIN_TOKEN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 86_400_000;
const MAX_LINKS_PER_WINDOW = 5;

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Only same-site relative paths are accepted as a post-login destination. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next.length > 300 ? null : next;
}

/**
 * Sends a one-time sign-in link. The response is identical whether or not the address already has
 * an account; accounts are created on first successful sign-in.
 */
export async function requestLoginLink(rawEmail: string, rawNext?: string | null): Promise<void> {
  const email = emailSchema.parse(rawEmail);
  if (!isEmailConfigured()) {
    throw new AppError("EMAIL_NOT_CONFIGURED", "ارسال ایمیل هنوز روی سرور پیکربندی نشده است. لطفاً بعداً تلاش کنید.");
  }
  const db = getDb();
  const since = new Date(Date.now() - LOGIN_TOKEN_TTL_MS);
  const [{ n }] = await db
    .select({ n: count() })
    .from(loginTokens)
    .where(and(eq(loginTokens.email, email), gt(loginTokens.createdAt, since)));
  if (n >= MAX_LINKS_PER_WINDOW) {
    throw new AppError("RATE_LIMITED", "تعداد درخواست‌ها زیاد است. چند دقیقه بعد دوباره تلاش کنید.");
  }

  const token = randomToken();
  await db.insert(loginTokens).values({
    email,
    tokenHash: sha256(token),
    nextPath: safeNextPath(rawNext),
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
  });

  const link = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "لینک ورود به تولد",
    text: `برای ورود به «تولد» این لینک را باز کنید (تا ۱۵ دقیقه معتبر است و فقط یک بار کار می‌کند):\n\n${link}\n\nاگر شما درخواست ورود نداده‌اید، این ایمیل را نادیده بگیرید.`,
    html: `<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9">
<p>برای ورود به «تولد» روی دکمه زیر بزنید. این لینک تا ۱۵ دقیقه معتبر است و فقط یک بار کار می‌کند.</p>
<p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">ورود به تولد</a></p>
<p style="color:#666;font-size:13px">اگر شما درخواست ورود نداده‌اید، این ایمیل را نادیده بگیرید.</p></div>`,
  });
}

/**
 * Consumes a sign-in token exactly once and opens a session. Runs on an explicit POST from the
 * verify page, so link scanners that merely GET the URL cannot burn the token.
 */
export async function consumeLoginToken(
  token: string,
): Promise<{ sessionToken: string; userId: string; nextPath: string | null; isNewUser: boolean }> {
  if (!token || token.length > 200) throw invalid("لینک ورود معتبر نیست.");
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(loginTokens)
      .where(eq(loginTokens.tokenHash, sha256(token)))
      .for("update")
      .limit(1);
    if (!row) throw invalid("لینک ورود معتبر نیست.");
    if (row.usedAt) throw invalid("این لینک ورود قبلاً استفاده شده است. دوباره درخواست لینک کنید.");
    if (row.expiresAt.getTime() < Date.now()) throw invalid("مهلت این لینک ورود تمام شده است. دوباره درخواست لینک کنید.");
    await tx.update(loginTokens).set({ usedAt: new Date() }).where(eq(loginTokens.id, row.id));

    let [user] = await tx.select().from(users).where(eq(users.email, row.email)).limit(1);
    const isNewUser = !user;
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({ email: row.email, name: row.email.split("@")[0].slice(0, 60) })
        .onConflictDoNothing()
        .returning();
      user ??= (await tx.select().from(users).where(eq(users.email, row.email)).limit(1))[0];
    }
    const sessionToken = randomToken();
    await tx.insert(sessions).values({
      tokenHash: sha256(sessionToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    return { sessionToken, userId: user.id, nextPath: row.nextPath, isNewUser };
  });
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getUserForSession(sessionToken: string | undefined): Promise<SessionUser | null> {
  if (!sessionToken || sessionToken.length > 200) return null;
  const [row] = await getDb()
    .select({ id: users.id, email: users.email, name: users.name, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(sessionToken)))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export async function deleteSession(sessionToken: string | undefined): Promise<void> {
  if (!sessionToken) return;
  await getDb().delete(sessions).where(eq(sessions.tokenHash, sha256(sessionToken)));
}

export async function updateProfileName(userId: string, rawName: string): Promise<void> {
  const name = displayName.parse(rawName);
  await getDb().update(users).set({ name }).where(eq(users.id, userId));
}

/** Housekeeping: drop expired sessions and login tokens older than a day. */
export async function purgeExpiredAuth(): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, new Date(Date.now() - 86_400_000)));
}
