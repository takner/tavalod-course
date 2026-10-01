import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/AppIcon";

const SIZES: Record<string, { size: number; padding: number }> = {
  "192": { size: 192, padding: 0 },
  "512": { size: 512, padding: 0 },
  maskable: { size: 512, padding: 64 },
  apple: { size: 180, padding: 0 },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const spec = SIZES[size];
  if (!spec) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppIconArt size={spec.size} padding={spec.padding} />, {
    width: spec.size,
    height: spec.size,
  });
}
