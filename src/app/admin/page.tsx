import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
export const dynamic = "force-dynamic";
const RANGES: [string, string][] = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["all", "All time"],
];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { range?: string; m?: string };
}) {
  await pageSuper();
  const range = RANGES.some(([k]) => k === searchParams.range)
    ? searchParams.range!
    : "30";
  const since =
    range === "all"
      ? undefined
      : new Date(Date.now() - Number(range) * 86_400_000);
  const open = {
    status: { in: ["PENDING", "PROCESSING"] as ("PENDING" | "PROCESSING")[] },
  };

  const [agents, bloggers, pv, av, pw, views, earn, owed, admins, rev, act] =
    await Promise.all([
      db.agent.count({ where: { status: "ACTIVE" } }),
      db.blogger.count({ where: { status: "ACTIVE" } }),
      db.video.count({ where: { status: "PENDING" } }),
      db.video.count({ where: { status: "APPROVED" } }),
      db.withdrawal.count({ where: open }),
      db.video.aggregate({
        _sum: { views: true },
        where: { status: "APPROVED" },
      }),
      db.video.aggregate({
        _sum: { earnings: true },
        where: { status: "APPROVED" },
      }),
      db.withdrawal.aggregate({ _sum: { amount: true }, where: open }),
      db.admin.findMany({ orderBy: { createdAt: "asc" } }),
      db.video.groupBy({
        by: ["reviewedById", "status"],
        where: {
          reviewedById: { not: null },
          ...(since ? { reviewedAt: { gte: since } } : {}),
        },
        _count: { _all: true },
      }),
      db.viewHistory.groupBy({
        by: ["actorId", "source"],
        where: {
          actorId: { not: null },
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        _count: { _all: true },
        _sum: { delta: true },
      }),
    ]);

  // per-admin work: approved / rejected videos, auto-fetches, manual edits, views added
  const rows = admins.map((a) => {
    const c = (st: string) =>
      rev.find((r) => r.reviewedById === a.id && r.status === st)?._count
        ._all ?? 0;
    const f = act.find((r) => r.actorId === a.id && r.source === "FETCH");
    const m = act.find((r) => r.actorId === a.id && r.source === "MANUAL");
    return {
      a,
      ap: c("APPROVED"),
      rj: c("REJECTED"),
      fc: f?._count._all ?? 0,
      mc: m?._count._all ?? 0,
      added: (f?._sum.delta ?? 0) + (m?._sum.delta ?? 0),
    };
  });

  // ---- Month-wise report (IST months, last 12) ----
  const msince = new Date(Date.now() - 400 * 86_400_000);
  type N = { m: string; n: number };
  const [mAg, mBl, mVs, mRv, mVh, mWr, mPd] = await Promise.all([
    db.$queryRaw<
      N[]
    >`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AS m, COUNT(*)::int AS n FROM "Agent" WHERE "createdAt" >= ${msince} GROUP BY 1`,
    db.$queryRaw<
      { m: string; n: number; amt: number }[]
    >`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AS m, COUNT(*)::int AS n, COALESCE(SUM("agentBonus"),0)::float8 AS amt FROM "Blogger" WHERE "createdAt" >= ${msince} AND "status" <> 'DELETED' GROUP BY 1`,
    db.$queryRaw<
      N[]
    >`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AS m, COUNT(*)::int AS n FROM "Video" WHERE "createdAt" >= ${msince} GROUP BY 1`,
    db.$queryRaw<
      { m: string; a: number; r: number }[]
    >`SELECT to_char(("reviewedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AS m, (COUNT(*) FILTER (WHERE "status" = 'APPROVED'))::int AS a, (COUNT(*) FILTER (WHERE "status" = 'REJECTED'))::int AS r FROM "Video" WHERE "reviewedAt" >= ${msince} GROUP BY 1`,
    db.$queryRaw<
      { m: string; v: number; e: number }[]
    >`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AS m, COALESCE(SUM("delta"),0)::float8 AS v, COALESCE(SUM("earned"),0)::float8 AS e FROM "ViewHistory" WHERE "createdAt" >= ${msince} GROUP BY 1`,
    db.$queryRaw<
      { m: string; amt: number }[]
    >`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AS m, COALESCE(SUM("amount"),0)::float8 AS amt FROM "Withdrawal" WHERE "createdAt" >= ${msince} AND "status" <> 'REJECTED' GROUP BY 1`,
    db.$queryRaw<
      { m: string; amt: number }[]
    >`SELECT to_char(("updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AS m, COALESCE(SUM("amount"),0)::float8 AS amt FROM "Withdrawal" WHERE "updatedAt" >= ${msince} AND "status" = 'PAID' GROUP BY 1`,
  ]);
  const nowIST = new Date(Date.now() + 5.5 * 3600_000);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(
      Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth() - i, 1),
    );
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
    };
  });
  const g = <T extends { m: string }>(rows: T[], m: string) =>
    rows.find((r) => r.m === m);
  const inr = (x?: number) =>
    (x ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  // ---- Cards: This month (default), Last month, All time, or any of the last 12 months (IST) ----
  const fmt = (n: number) => n.toLocaleString("en-IN");
  const sel = searchParams.m ?? "this";
  const selKey =
    sel === "this"
      ? months[0].key
      : sel === "prev"
        ? months[1].key
        : months.some((x) => x.key === sel)
          ? sel
          : null; // null = all time
  const selLabel = selKey
    ? months.find((x) => x.key === selKey)!.label
    : "All time";
  let cards: [string, string | number][];
  if (!selKey) {
    cards = [
      ["Active agents", agents],
      ["Active bloggers", bloggers],
      ["Pending videos", pv],
      ["Approved videos", av],
      ["Open payments", pw],
      ["Open payments ₹", Number(owed._sum.amount ?? 0).toFixed(2)],
      ["Total views", (views._sum.views ?? 0).toLocaleString("en-IN")],
      ["Blogger earnings ₹", Number(earn._sum.earnings ?? 0).toFixed(2)],
    ];
  } else {
    const [y, mo] = selKey.split("-").map(Number);
    const IST = 5.5 * 3600_000;
    const inM = {
      gte: new Date(Date.UTC(y, mo - 1, 1) - IST),
      lt: new Date(Date.UTC(y, mo, 1) - IST),
    };
    const [nA, nB, sub, pend, apr, rej, op, paid, vh] = await Promise.all([
      db.agent.count({ where: { createdAt: inM } }),
      db.blogger.aggregate({
        where: { createdAt: inM, status: { not: "DELETED" } },
        _count: { _all: true },
        _sum: { agentBonus: true },
      }),
      db.video.count({ where: { createdAt: inM } }),
      db.video.count({ where: { createdAt: inM, status: "PENDING" } }),
      db.video.count({ where: { reviewedAt: inM, status: "APPROVED" } }),
      db.video.count({ where: { reviewedAt: inM, status: "REJECTED" } }),
      db.withdrawal.aggregate({
        where: { createdAt: inM, ...open },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      db.withdrawal.aggregate({
        where: { updatedAt: inM, status: "PAID" },
        _sum: { amount: true },
      }),
      db.viewHistory.aggregate({
        where: { createdAt: inM },
        _sum: { delta: true, earned: true },
      }),
    ]);
    cards = [
      ["New agents", nA],
      ["New bloggers", nB._count._all],
      ["Pending videos", pend],
      ["Approved videos", apr],
      ["Open payments", op._count._all],
      ["Open payments ₹", Number(op._sum.amount ?? 0).toFixed(2)],
      ["Views added", fmt(vh._sum.delta ?? 0)],
      ["Blogger earnings ₹", Number(vh._sum.earned ?? 0).toFixed(2)],
      ["Videos submitted", sub],
      ["Rejected videos", rej],
      ["Payments paid ₹", Number(paid._sum.amount ?? 0).toFixed(2)],
      ["Agent commission ₹", Number(nB._sum.agentBonus ?? 0).toFixed(2)],
    ];
  }
  const tab = (active: boolean) =>
    "px-3 py-1.5 rounded-lg text-sm border " +
    (active
      ? "bg-slate-800 text-white border-slate-800"
      : "bg-white border-slate-300");
  return (
    <>
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="flex flex-wrap items-center gap-2">
        <a href="?m=this" className={tab(sel === "this")}>
          This month ({months[0].label})
        </a>
        <a href="?m=prev" className={tab(sel === "prev")}>
          Last month ({months[1].label})
        </a>
        <a href="?m=all" className={tab(!selKey)}>
          All time
        </a>
        <form className="flex gap-1">
          <select name="m" defaultValue="" className="inp">
            <option value="" disabled>
              Older month
            </option>
            {months.slice(2).map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <button className="btn">Show</button>
        </form>
      </div>
      <p className="text-sm text-slate-500">
        Showing: <b>{selLabel}</b>
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(([l, v]) => (
          <div key={l} className="card">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>
      <div className="card space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="font-medium">Admin work report</h2>
          {RANGES.map(([k, l]) => (
            <a
              key={k}
              href={`?range=${k}`}
              className={
                "text-sm underline " + (k === range ? "font-bold" : "")
              }
            >
              {l}
            </a>
          ))}
        </div>
        <table>
          <thead>
            <tr>
              <th>Admin</th>
              <th>Role</th>
              <th>Approved</th>
              <th>Rejected</th>
              <th>Reviewed total</th>
              <th>Auto fetches</th>
              <th>Manual edits</th>
              <th>Views added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, ap, rj, fc, mc, added }) => (
              <tr key={a.id}>
                <td>
                  {a.name}
                  <div className="text-xs text-slate-500">
                    {a.email}
                    {a.active ? "" : " (deactivated)"}
                  </div>
                </td>
                <td>{a.role === "SUPER" ? "Super" : "Admin"}</td>
                <td>{ap}</td>
                <td>{rj}</td>
                <td>{ap + rj}</td>
                <td>{fc}</td>
                <td>{mc}</td>
                <td>{added.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500">
          Counts follow who approved/rejected each video, and who pressed Fetch
          or typed views. Cron fetches are not counted for any admin.
        </p>
      </div>
      {/* <div className="card space-y-2">
        <h2 className="font-medium">Monthly data (last 12 months, IST)</h2>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>New agents</th>
              <th>New bloggers</th>
              <th>Agent commission ₹</th>
              <th>Videos submitted</th>
              <th>Approved</th>
              <th>Rejected</th>
              <th>Views added</th>
              <th>Blogger earnings ₹</th>
              <th>Payments requested ₹</th>
              <th>Payments paid ₹</th>
            </tr>
          </thead>
          <tbody>
            {months.map(({ key, label }) => (
              <tr key={key}>
                <td>{label}</td>
                <td>{g(mAg, key)?.n ?? 0}</td>
                <td>{g(mBl, key)?.n ?? 0}</td>
                <td>{inr(g(mBl, key)?.amt)}</td>
                <td>{g(mVs, key)?.n ?? 0}</td>
                <td>{g(mRv, key)?.a ?? 0}</td>
                <td>{g(mRv, key)?.r ?? 0}</td>
                <td>{inr(g(mVh, key)?.v)}</td>
                <td>{inr(g(mVh, key)?.e)}</td>
                <td>{inr(g(mWr, key)?.amt)}</td>
                <td>{inr(g(mPd, key)?.amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500">
          Agent commission = bonus credited for bloggers who joined that month.
          Views added and blogger earnings count what was saved that month
          (adjusted views, corrections included). Payments paid = marked
          Complete that month.
        </p>
      </div> */}
      <div className="flex gap-3 text-sm">
        <a className="underline" href="/api/admin/export?type=videos">
          Export videos CSV
        </a>
        <a className="underline" href="/api/admin/export?type=payments">
          Export payments CSV
        </a>
      </div>
    </>
  );
}
