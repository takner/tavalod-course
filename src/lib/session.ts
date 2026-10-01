import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getUserForSession, SESSION_TTL_MS, type SessionUser } from "@/server/auth";
import { AppError } from "@/server/errors";

/** HTTPS deployments use the `__Secure-` prefix so the browser enforces the Secure flag. */
export function isSecureDeployment(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export function sessionCookieName(): string {
  return isSecureDeployment() ? "__Secure-tavalod_session" : "tavalod_session";
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(sessionCookieName());
}

/** The signed-in user for this request (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return getUserForSession(await readSessionToken());
});

/** For pages: redirects to the login page when signed out. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireActor(): Promise<{ userId: string; user: SessionUser }> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "ابتدا وارد حساب خود شوید.");
  return { userId: user.id, user };
}
