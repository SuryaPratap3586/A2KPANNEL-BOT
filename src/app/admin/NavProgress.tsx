"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Thin bar at the top of the screen while the next admin page (or tab) loads.
// Starts on any click on an internal link, finishes when the new URL has rendered. Never stays stuck: hidden after 15 s.
export default function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [width, setWidth] = useState(0); // 0 = hidden
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/admin")) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page
      clear();
      setWidth(15);
      timers.current.push(
        setTimeout(() => setWidth(45), 150),
        setTimeout(() => setWidth(70), 800),
        setTimeout(() => setWidth(90), 2500),
        setTimeout(() => setWidth(0), 15_000),
      );
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    // the new page is on screen: complete the bar, then hide it
    clear();
    setWidth((w) => (w ? 100 : 0));
    timers.current.push(setTimeout(() => setWidth(0), 250));
    return clear;
  }, [path, search]);

  return (
    <div
      aria-hidden
      className="fixed left-0 top-0 z-50 h-1 bg-amber-400 shadow-[0_0_6px] shadow-amber-400 transition-all duration-200 ease-out"
      style={{ width: `${width}%`, opacity: width ? 1 : 0 }}
    />
  );
}
