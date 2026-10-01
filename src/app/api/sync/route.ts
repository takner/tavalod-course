import { getCurrentUser } from "@/lib/session";
import { toAppError } from "@/server/errors";
import { processSyncOps, syncRequest } from "@/server/sync";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Replays queued create operations (expenses, settlements). Used for every create — online
 * submissions go through the same path as offline replays, so both share idempotency.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req) || !req.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "درخواست نامعتبر است." } }, { status: 403, headers: NO_STORE });
  }
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "ابتدا وارد حساب خود شوید." } },
      { status: 401, headers: NO_STORE },
    );
  }
  try {
    const body = syncRequest.parse(await req.json());
    const results = await processSyncOps({ userId: user.id }, body.ops);
    return Response.json({ userId: user.id, results }, { headers: NO_STORE });
  } catch (err) {
    const e = toAppError(err);
    return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: NO_STORE });
  }
}
