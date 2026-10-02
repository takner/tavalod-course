/** Small outline icon set (24×24, currentColor). `filled` is used for the active bottom-nav tab. */
type IconProps = { size?: number; className?: string; filled?: boolean };

function Svg({ size = 24, className, children, filled }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" fill="none" />
  </Svg>
);
export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0z" />
  </Svg>
);
export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const ReceiptIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Svg>
);
export const ScaleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18M7 21h10M5 7h14" />
    <path d="M5 7 2.5 13a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z" />
  </Svg>
);
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const WalletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h15a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 20H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M4 7 16 3.5V7M16 13.5h2" />
  </Svg>
);
export const GiftIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="8" width="17" height="4" rx="1" />
    <path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.5 8.5 8 12 8zM12 8s1.5-4.5 4-3.5S15.5 8 12 8z" />
  </Svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14 6-6 6 6 6" />
  </Svg>
);
export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const CakeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M5 15.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 5 0M12 12V8" />
    <path d="M12 4.5c.8.8.8 1.8 0 2.5-.8-.7-.8-1.7 0-2.5z" />
  </Svg>
);
export const PollIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 20V11M12 20V4M19 20v-6" />
  </Svg>
);
export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </Svg>
);
