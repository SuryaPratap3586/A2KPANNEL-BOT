import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
export const dynamic = "force-dynamic";
const RANGES: [string, string][] = [["7", "Last 7 days"], ["30", "Last 30 days"], ["all", "All time"]];

export default async function Dashboard({ searchParams }: { searchParams: { range?: string } }) {
  await pageSuper();
  const range = RANGES.some(([k]) => k === searchParams.range) ? searchParams.range! : "30";
  const since = range === "all" ? undefined : new Date(Date.now() - Number(range) * 86_400_000);
  const open = { status: { in: ["PENDING", "PROCESSING"] as ("PENDING" | "PROCESSING")[] } };

  const [agents, bloggers, pv, av, pw, views, earn, owed, admins, rev, act] = await Promise.all([
    db.agent.count({ where: { status: "ACTIVE" } }), db.blogger.count({ where: { status: "ACTIVE" } }),
    db.video.count({ where: { status: "PENDING" } }), db.video.count({ where: { status: "APPROVED" } }),
    db.withdrawal.count({ where: open }),
    db.video.aggregate({ _sum: { views: true }, where: { status: "APPROVED" } }),
    db.video.aggregate({ _sum: { earnings: true }, where: { status: "APPROVED" } }),
    db.withdrawal.aggregate({ _sum: { amount: true }, where: open }),
    db.admin.findMany({ orderBy: { createdAt: "asc" } }),
    db.video.groupBy({ by: ["reviewedById", "status"], where: { reviewedById: { not: null }, ...(since ? { reviewedAt: { gte: since } } : {}) }, _count: { _all: true } }),
    db.viewHistory.groupBy({ by: ["actorId", "source"], where: { actorId: { not: null }, ...(since ? { createdAt: { gte: since } } : {}) }, _count: { _all: true }, _sum: { delta: true } }),
  ]);

  // per-admin work: approved / rejected videos, auto-fetches, manual edits, views added
  const rows = admins.map((a) => {
    const c = (st: string) => rev.find((r) => r.reviewedById === a.id && r.status === st)?._count._all ?? 0;
    const f = act.find((r) => r.actorId === a.id && r.source === "FETCH");
    const m = act.find((r) => r.actorId === a.id && r.source === "MANUAL");
    return { a, ap: c("APPROVED"), rj: c("REJECTED"), fc: f?._count._all ?? 0, mc: m?._count._all ?? 0, added: (f?._sum.delta ?? 0) + (m?._sum.delta ?? 0) };
  });

  const cards: [string, string | number][] = [["Active agents", agents], ["Active bloggers", bloggers], ["Pending videos", pv], ["Approved videos", av], ["Open payments", pw], ["Open payments ₹", Number(owed._sum.amount ?? 0).toFixed(2)], ["Total views", (views._sum.views ?? 0).toLocaleString("en-IN")], ["Blogger earnings ₹", Number(earn._sum.earnings ?? 0).toFixed(2)]];
  return (<><h1 className="text-xl font-semibold">Dashboard</h1>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{cards.map(([l, v]) => <div key={l} className="card"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-bold">{v}</div></div>)}</div>
    <div className="card space-y-2">
      <div className="flex items-center gap-3"><h2 className="font-medium">Admin work report</h2>{RANGES.map(([k, l]) => <a key={k} href={`?range=${k}`} className={"text-sm underline " + (k === range ? "font-bold" : "")}>{l}</a>)}</div>
      <table><thead><tr><th>Admin</th><th>Role</th><th>Approved</th><th>Rejected</th><th>Reviewed total</th><th>Auto fetches</th><th>Manual edits</th><th>Views added</th></tr></thead><tbody>
        {rows.map(({ a, ap, rj, fc, mc, added }) => <tr key={a.id}><td>{a.name}<div className="text-xs text-slate-500">{a.email}{a.active ? "" : " (deactivated)"}</div></td><td>{a.role === "SUPER" ? "Super" : "Admin"}</td><td>{ap}</td><td>{rj}</td><td>{ap + rj}</td><td>{fc}</td><td>{mc}</td><td>{added.toLocaleString("en-IN")}</td></tr>)}
      </tbody></table>
      <p className="text-xs text-slate-500">Counts follow who approved/rejected each video, and who pressed Fetch or typed views. Cron fetches are not counted for any admin.</p>
    </div>
    <div className="flex gap-3 text-sm"><a className="underline" href="/api/admin/export?type=videos">Export videos CSV</a><a className="underline" href="/api/admin/export?type=payments">Export payments CSV</a></div></>);
}
