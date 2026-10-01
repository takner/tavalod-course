import Link from "next/link";
import { formatToman } from "@/domain/money";

export function PageHeader({
  title,
  back,
  subtitle,
  action,
}: {
  title: string;
  back?: { href: string; label: string };
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
          <span aria-hidden>→</span> {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-9">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
        </div>
        {action}
      </div>
    </header>
  );
}

/** A signed balance: green when the member is owed, red when they owe. */
export function Balance({ value, className = "" }: { value: bigint; className?: string }) {
  const tone = value > 0n ? "text-positive" : value < 0n ? "text-negative" : "text-muted";
  return <span className={`tabular font-bold ${tone} ${className}`}>{formatToman(value, { signed: true })}</span>;
}

export function balanceHint(value: bigint): string {
  if (value > 0n) return "طلبکار";
  if (value < 0n) return "بدهکار";
  return "تسویه";
}

export function Money({ value, className = "" }: { value: bigint; className?: string }) {
  return <span className={`tabular ${className}`}>{formatToman(value)}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm leading-7 text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warning"; children: React.ReactNode }) {
  const styles = {
    info: "bg-primary-soft text-primary-strong",
    error: "bg-negative-soft text-negative",
    success: "bg-positive-soft text-positive",
    warning: "bg-warning-soft text-warning",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm leading-7 ${styles}`}>
      {children}
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "primary" | "warning" | "negative" | "positive" }) {
  const styles = {
    neutral: "bg-surface-2 text-muted",
    primary: "bg-primary-soft text-primary-strong",
    warning: "bg-warning-soft text-warning",
    negative: "bg-negative-soft text-negative",
    positive: "bg-positive-soft text-positive",
  }[tone];
  return <span className={`chip ${styles}`}>{children}</span>;
}
