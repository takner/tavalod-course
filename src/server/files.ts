import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { files, gifts, wishlistGroups, wishlistItems, wishlists, groupMembers } from "@/db/schema";
import { assertId, requireSpaceMember, type Actor } from "./access";
import { sha256 } from "./crypto";
import { invalid, notFound } from "./errors";

export const MAX_IMAGE_BYTES = 1_500_000;
export type FilePurpose = "wishlist" | "receipt";

/** Detects the real image type from its first bytes; the browser-declared type is not trusted. */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Stores an uploaded image in the database (so it is covered by the normal backups). The client
 * re-encodes photos before upload, which also strips EXIF metadata such as GPS location.
 */
export async function saveImage(actor: Actor, purpose: FilePurpose, file: File): Promise<{ fileId: string }> {
  if (!(file instanceof File) || file.size === 0) throw invalid("فایلی انتخاب نشده است.");
  if (file.size > MAX_IMAGE_BYTES) throw invalid("حجم تصویر زیاد است (حداکثر ۱٫۵ مگابایت).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) throw invalid("فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود.");
  const [row] = await getDb()
    .insert(files)
    .values({
      ownerUserId: actor.userId,
      purpose,
      contentType,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      data: Buffer.from(bytes),
    })
    .returning({ id: files.id });
  return { fileId: row.id };
}

/**
 * Returns a file only to someone allowed to see what it belongs to:
 * - wishlist image: the list owner, members of a group the list is shared with, or a valid share link;
 * - receipt: members of the gift's private space (never the celebrant).
 */
export async function readFile(actor: Actor | null, fileId: string, shareToken?: string | null) {
  assertId(fileId, "فایل");
  const db = getDb();
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) throw notFound("فایل");

  if (file.purpose === "receipt") {
    if (!actor) throw notFound("فایل");
    if (file.ownerUserId !== actor.userId) {
      const [gift] = await db.select({ spaceId: gifts.spaceId }).from(gifts).where(eq(gifts.receiptFileId, fileId)).limit(1);
      if (!gift) throw notFound("فایل");
      await requireSpaceMember(db, gift.spaceId, actor);
    }
    return file;
  }

  if (file.purpose === "wishlist") {
    if (actor && file.ownerUserId === actor.userId) return file;
    const [item] = await db
      .select({ wishlistId: wishlistItems.wishlistId, shareTokenHash: wishlists.shareTokenHash, ownerUserId: wishlists.ownerUserId })
      .from(wishlistItems)
      .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
      .where(and(eq(wishlistItems.imageFileId, fileId), isNull(wishlists.deletedAt)))
      .limit(1);
    if (!item) throw notFound("فایل");
    if (shareToken && item.shareTokenHash && sha256(shareToken) === item.shareTokenHash) return file;
    if (actor) {
      const [visible] = await db
        .select({ g: wishlistGroups.groupId })
        .from(wishlistGroups)
        .innerJoin(groupMembers, eq(groupMembers.groupId, wishlistGroups.groupId))
        .where(and(eq(wishlistGroups.wishlistId, item.wishlistId), eq(groupMembers.userId, actor.userId), isNull(groupMembers.leftAt)))
        .limit(1);
      if (visible) return file;
    }
  }
  throw notFound("فایل");
}
