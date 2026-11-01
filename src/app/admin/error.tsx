"use client";
import { useEffect } from "react";

// Any failed page load or action (wrong value, missing field, lost database connection) lands here instead of a blank page.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => console.error(error), [error]);
  const unauthorized = /Unauthorized|Forbidden/.test(error.message);
  return (
    <div className="card space-y-2 border-red-300">
      <h2 className="font-semibold text-red-700">❌ The action failed</h2>
      <p className="text-sm">
        {unauthorized
          ? "You are not allowed to do this, or your session has ended. Please sign in again."
          : "Nothing was saved. Check the values you entered (numbers, required reason, valid link) and try again. If it keeps failing, the database may be unreachable for a moment."}
      </p>
      {error.digest && (
        <p className="text-xs text-slate-500">Error code: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button className="btn" onClick={() => reset()}>
          Try again
        </button>
        <a className="btn" href={unauthorized ? "/login" : "/admin/videos"}>
          {unauthorized ? "Sign in" : "Back to videos"}
        </a>
      </div>
    </div>
  );
}
