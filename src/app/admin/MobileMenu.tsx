"use client";
import { usePathname } from "next/navigation";

// Phone / small screen menu: a top bar that opens the admin links and closes itself after you pick a page.
export default function MobileMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const path = usePathname(); // new key on every page change = menu closes
  return (
    <details key={path} className="md:hidden">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
        <span className="font-bold text-amber-400">A2K Admin</span>
        <span className="text-sm text-slate-300">{label} ☰</span>
      </summary>
      <div className="px-4 pb-4 space-y-1">{children}</div>
    </details>
  );
}
