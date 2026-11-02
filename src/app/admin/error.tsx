"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

// Any failed page load or action (wrong value, missing field, lost database connection) lands here instead of a blank page.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => console.error(error), [error]);
  const router = useRouter();
  const [busy, start] = useTransition();
  // reload the page data from the server, then show the page again
  const retry = () => start(() => { router.refresh(); reset(); });
  const unauthorized = /Unauthorized|Forbidden/.test(error.message);
  return (
    <div className="card space-y-2 border-red-300">
      <h2 className="font-semibold text-red-700">❌ This page or action failed</h2>
      <p className="text-sm">
        {unauthorized
          ? "You are not allowed to do this, or your session has ended. Please sign in again."
          : "The page could not be loaded, or the change was not saved. Check the values you entered (numbers, required reason, valid link) and press Try again. If it keeps failing, the database may be unreachable for a moment."}
      </p>
      {!unauthorized && error.message && !error.digest && (
        <p className="text-xs text-slate-600">{error.message}</p>
      )}
      {error.digest && (
        <p className="text-xs text-slate-500">Error code: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button className="btn" onClick={retry} disabled={busy}>
          {busy ? "⏳ Loading…" : "Try again"}
        </button>
        <a className="btn" href={unauthorized ? "/login" : "/admin/videos"}>
          {unauthorized ? "Sign in" : "Back to videos"}
        </a>
      </div>
    </div>
  );
}
