import Link from "next/link";

/** Round, colourful quick-action button with a label underneath and an optional badge chip. */
export function Shortcut({
  href,
  label,
  color,
  icon,
  badge,
}: {
  href: string;
  label: string;
  /** Tailwind background class for the circle, e.g. "bg-[#f57c00]". */
  color: string;
  icon: React.ReactNode;
  badge?: string;
}) {
  return (
    <Link href={href} className="flex w-[72px] shrink-0 flex-col items-center gap-2 text-center">
      <span className={`relative flex size-14 items-center justify-center rounded-full text-white shadow-sm ${color}`}>
        {icon}
        {badge && (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-bold whitespace-nowrap text-white ring-2 ring-surface">
            {badge}
          </span>
        )}
      </span>
      <span className="text-xs leading-5 font-medium text-text">{label}</span>
    </Link>
  );
}
