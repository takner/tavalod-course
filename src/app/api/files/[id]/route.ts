import { getCurrentUser } from "@/lib/session";
import { toAppError } from "@/server/errors";
import { readFile } from "@/server/files";

export const dynamic = "force-dynamic";

/** Serves an uploaded image only to people allowed to see what it belongs to (see readFile). */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const token = new URL(req.url).searchParams.get("t");
  try {
    const file = await readFile(user ? { userId: user.id } : null, id, token);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    const e = toAppError(err);
    return new Response("Not found", { status: e.code === "NOT_FOUND" ? 404 : e.status, headers: { "Cache-Control": "no-store" } });
  }
}
