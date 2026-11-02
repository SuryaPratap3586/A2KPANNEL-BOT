"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Sidebar links. The clicked item is highlighted at once (before the next page has loaded), then follows the real URL.
export default function NavLinks({ nav }: { nav: string[][] }) {
  const path = usePathname();
  const [clicked, setClicked] = useState<string | null>(null);
  useEffect(() => setClicked(null), [path]); // page arrived: the URL decides again
  const current = clicked ?? path;
  const active = (h: string) =>
    h === "/admin" ? current === "/admin" : current === h || current.startsWith(h + "/");
  return (
    <>
      {nav.map(([l, h]) => (
        <Link
          key={h}
          href={h}
          onClick={() => h !== path && setClicked(h)}
          aria-current={active(h) ? "page" : undefined}
          className={
            "block px-2 py-1.5 rounded text-sm " +
            (active(h)
              ? "bg-amber-400 text-slate-900 font-semibold"
              : "hover:bg-slate-700")
          }
        >
          {l}
        </Link>
      ))}
    </>
  );
}
