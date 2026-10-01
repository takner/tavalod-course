import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { AppError } from "./errors";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type Transport = "smtp" | "console" | "outbox";

function transportKind(): Transport {
  const kind = (process.env.EMAIL_TRANSPORT ?? "smtp") as Transport;
  if (process.env.NODE_ENV === "production" && kind !== "smtp") {
    // Never print or store login links outside a real mailbox in production.
    return "smtp";
  }
  return kind;
}

export function isEmailConfigured(): boolean {
  if (transportKind() !== "smtp") return true;
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM);
}

let cached: Transporter | null = null;

function smtp(): Transporter {
  cached ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return cached;
}

export async function sendMail(mail: Mail): Promise<void> {
  const kind = transportKind();
  if (kind === "console") {
    console.info(`[mail:console] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  if (kind === "outbox") {
    const dir = path.join(process.cwd(), ".e2e-outbox");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(file, JSON.stringify(mail));
    return;
  }
  if (!isEmailConfigured()) {
    throw new AppError("EMAIL_NOT_CONFIGURED", "ارسال ایمیل هنوز روی سرور پیکربندی نشده است. لطفاً بعداً تلاش کنید.");
  }
  try {
    await smtp().sendMail({ from: process.env.EMAIL_FROM, ...mail });
  } catch (err) {
    console.error("smtp send failed:", err instanceof Error ? err.message : err);
    throw new AppError("EMAIL_NOT_CONFIGURED", "ارسال ایمیل با خطا روبه‌رو شد. چند دقیقه بعد دوباره تلاش کنید.");
  }
}
