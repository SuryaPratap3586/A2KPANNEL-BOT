// Shown at once while the next admin page loads (the sidebar stays), so clicks always get instant feedback.
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-20" />
        ))}
      </div>
      <div className="card h-64" />
      <p className="text-sm text-slate-500">Loading…</p>
    </div>
  );
}
