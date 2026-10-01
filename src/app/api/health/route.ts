import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/** Liveness + DB check. Reports the deployed release so deploys can verify what is running. */
export async function GET() {
  const release = process.env.APP_RELEASE ?? "dev";
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", release, db: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error", release, db: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
