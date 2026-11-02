// Small inline icons for the video cards (no icon library needed). All take className for size / color.
type P = { className?: string };
const base = (className = "w-5 h-5") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const Eye = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
);
export const Calendar = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 17.5h.01M12 17.5h.01" />
  </svg>
);
export const UpDown = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4" />
  </svg>
);
export const Coins = ({ className }: P) => (
  <svg {...base(className)}>
    <ellipse cx="12" cy="6" rx="7" ry="3" fill="currentColor" fillOpacity=".15" />
    <path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" />
  </svg>
);
export const Clock = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const Bars = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <rect x="3" y="12" width="4.5" height="9" rx="1" />
    <rect x="9.75" y="7" width="4.5" height="14" rx="1" />
    <rect x="16.5" y="3" width="4.5" height="18" rx="1" />
  </svg>
);
export const Pencil = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
  </svg>
);
export const Save = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M7 3v5h8V3M7 21v-7h10v7" />
  </svg>
);
export const Refresh = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
  </svg>
);
export const LinkIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);
export const Check = ({ className }: P) => (
  <svg className={className ?? "w-5 h-5"} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Cross = ({ className }: P) => (
  <svg className={className ?? "w-5 h-5"} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
export const Thumb = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M2 10h4v11H2zM8 21h9.3a2 2 0 0 0 2-1.6l1.6-7.4A2 2 0 0 0 19 9.6h-5.2l.8-4A2.3 2.3 0 0 0 12.4 3L8 9.5z" />
  </svg>
);
export const Bubble = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />
  </svg>
);
export const Chevron = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** Platform logo tile (brand colors, simple shapes). */
export function PlatformLogo({ platform }: { platform: string }) {
  if (platform === "YOUTUBE")
    return (
      <svg viewBox="0 0 48 34" className="w-12 h-9 shrink-0" aria-label="YouTube">
        <rect width="48" height="34" rx="9" fill="#FF0000" />
        <path d="M19 10l13 7-13 7z" fill="#fff" />
      </svg>
    );
  if (platform === "INSTAGRAM")
    return (
      <svg viewBox="0 0 40 40" className="w-10 h-10 shrink-0" aria-label="Instagram">
        <defs>
          <linearGradient id="ig" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#FEDA75" />
            <stop offset=".35" stopColor="#FA7E1E" />
            <stop offset=".65" stopColor="#D62976" />
            <stop offset="1" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#ig)" />
        <rect x="10" y="10" width="20" height="20" rx="6" fill="none" stroke="#fff" strokeWidth="2.6" />
        <circle cx="20" cy="20" r="4.6" fill="none" stroke="#fff" strokeWidth="2.6" />
        <circle cx="26.3" cy="13.7" r="1.5" fill="#fff" />
      </svg>
    );
  if (platform === "FACEBOOK")
    return (
      <svg viewBox="0 0 40 40" className="w-10 h-10 shrink-0" aria-label="Facebook">
        <circle cx="20" cy="20" r="20" fill="#1877F2" />
        <path d="M22.5 31V21.5h3.2l.5-3.8h-3.7v-2.4c0-1.1.3-1.8 1.9-1.8h2V10.1a26 26 0 0 0-2.9-.1c-2.9 0-4.8 1.8-4.8 5v2.7h-3.2v3.8h3.2V31z" fill="#fff" />
      </svg>
    );
  if (platform === "MOJ")
    return (
      <svg viewBox="0 0 40 40" className="w-10 h-10 shrink-0" aria-label="Moj">
        <rect width="40" height="40" rx="11" fill="#FFB800" />
        <path d="M11 28V13l9 9 9-9v15" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-200 grid place-items-center text-xs font-bold text-slate-600">
      {platform.slice(0, 2)}
    </div>
  );
}
