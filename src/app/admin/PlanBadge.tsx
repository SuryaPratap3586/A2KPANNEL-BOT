// Small mark shown next to an agent / blogger: the plan of the agent (D, S, ...)
const COLORS: Record<string, string> = {
  D: "bg-indigo-600",
  S: "bg-emerald-600",
};
export default function PlanBadge({ code }: { code?: string | null }) {
  if (!code) return null;
  return (
    <span
      className={`inline-block rounded px-1.5 text-xs font-bold text-white align-middle ${COLORS[code] ?? "bg-slate-700"}`}
      title={`Plan ${code}`}
    >
      {code}
    </span>
  );
}
