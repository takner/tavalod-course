import { DomainError } from "@/domain/errors";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "EMAIL_NOT_CONFIGURED"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  EMAIL_NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

/** Error with a stable code, an HTTP status and a Persian, user-facing message. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(code: AppErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.detail = detail;
  }
}

export const notFound = (what = "مورد درخواستی") => new AppError("NOT_FOUND", `${what} پیدا نشد.`);
export const forbidden = (message = "اجازه انجام این کار را ندارید.") => new AppError("FORBIDDEN", message);
export const invalid = (message: string, detail?: string) => new AppError("VALIDATION", message, detail);

/** Normalises any thrown value into an AppError (unknown errors become a generic message). */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof DomainError) return new AppError("VALIDATION", err.message, err.code);
  if (isZodLike(err)) {
    const first = err.issues[0]?.message;
    const message = first && /[؀-ۿ]/.test(first) ? first : "اطلاعات ارسالی معتبر نیست.";
    return new AppError("VALIDATION", message, err.issues.map((i) => i.path.join(".")).join(","));
  }
  return new AppError("INTERNAL", "خطای غیرمنتظره رخ داد. دوباره تلاش کنید.");
}

function isZodLike(err: unknown): err is { issues: { path: PropertyKey[]; message?: string }[] } {
  return typeof err === "object" && err !== null && Array.isArray((err as { issues?: unknown }).issues);
}
