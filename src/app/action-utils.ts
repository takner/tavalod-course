import type { ActionState } from "./actions";
import { toAppError } from "@/server/errors";

export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; state: ActionState }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const e = toAppError(err);
    if (e.code === "INTERNAL") console.error("action failed:", err);
    return { ok: false, state: { ok: false, error: e.message } };
  }
}

export const str = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

export const strs = (fd: FormData, name: string) => fd.getAll(name).filter((v): v is string => typeof v === "string" && v !== "");

export const optFile = (fd: FormData, name: string): File | null => {
  const v = fd.get(name);
  return v instanceof File && v.size > 0 ? v : null;
};
