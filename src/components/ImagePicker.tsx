"use client";

import { useRef, useState } from "react";

const MAX_SIDE = 1280;

/**
 * Picks a photo and re-encodes it in the browser (max 1280px, JPEG). Re-encoding drops EXIF
 * metadata such as GPS location and keeps uploads small. The result replaces the file input value.
 */
export function ImagePicker({ name, label, currentUrl }: { name: string; label: string; currentUrl?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("فقط تصویر انتخاب کنید.");
      e.target.value = "";
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.82));
      const clean = new File([blob], "image.jpg", { type: "image/jpeg" });
      const dt = new DataTransfer();
      dt.items.add(clean);
      e.target.files = dt.files;
      setPreview(URL.createObjectURL(clean));
    } catch {
      setError("این تصویر قابل پردازش نیست؛ تصویر دیگری انتخاب کنید.");
      e.target.value = "";
    }
  }

  return (
    <div>
      <label htmlFor={`${name}-file`} className="label">
        {label}
      </label>
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-16 rounded-xl object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-xl bg-surface-2 text-xs text-muted">بدون تصویر</span>
        )}
        <input ref={input} id={`${name}-file`} name={name} type="file" accept="image/*" onChange={onChange} className="text-xs" />
      </div>
      <p className="hint">قبل از ارسال کوچک می‌شود و اطلاعات مکان عکس حذف می‌شود.</p>
      {error && <p className="mt-1 text-xs text-negative">{error}</p>}
    </div>
  );
}
