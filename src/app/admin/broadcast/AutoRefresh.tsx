"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While a broadcast is sending, reloads the delivery numbers every few seconds (only this page's data, not the whole page).
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return <span className="text-xs text-slate-500">updating live…</span>;
}
