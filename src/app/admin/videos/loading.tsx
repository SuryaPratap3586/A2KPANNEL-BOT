// Shown at once while the Videos page (or another tab of it) loads: same shape as the real page, so nothing jumps.
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading videos">
      <div className="h-6 w-32 rounded bg-slate-200" />
      <div className="flex flex-wrap gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-4 w-24 rounded bg-slate-200" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-200" />
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-slate-200" />
              <div className="h-3 w-64 rounded bg-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="h-20 rounded-xl border border-slate-200 bg-slate-50" />
            ))}
          </div>
        </div>
      ))}
      <p className="text-sm text-slate-500">Loading videos…</p>
    </div>
  );
}
