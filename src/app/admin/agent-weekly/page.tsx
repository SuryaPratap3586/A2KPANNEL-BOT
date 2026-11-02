import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { creditEligible, minVideos } from "@/lib/commission";
import { weekStartIST } from "@/lib/week";
import { createAgentPayout } from "../actions";
import PlanBadge from "../PlanBadge";
export const dynamic = "force-dynamic";
const DAY = 86_400_000;
const inr = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const day = (d: Date) =>
  new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const tone: Record<string, string> = {
  PAID: "text-green-700",
  "IN PROCESS": "text-blue-700",
  DUE: "text-amber-700",
  WAITING: "text-slate-500",
};

// Week by week for every agent: how many bloggers he added that week, how many of them are paid, how many are pending.
export default async function AgentWeekly({
  searchParams,
}: {
  searchParams: { msg?: string };
}) {
  await pageSuper();
  await creditEligible();
  const need = await minVideos();

  const [agents, pay, adj] = await Promise.all([
    db.agent.findMany({
      where: { status: { not: "DELETED" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        plan: true,
        bloggers: {
          where: { status: { not: "DELETED" } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            createdAt: true,
            agentBonus: true,
            bonusCreditedAt: true,
          },
        },
      },
    }),
    db.withdrawal.groupBy({
      by: ["agentId", "status"],
      where: { agentId: { not: null } },
      _sum: { amount: true },
    }),
    db.adjustment.groupBy({
      by: ["agentId"],
      where: { agentId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const rows = agents.map((a) => {
    const sum = (st: string[]) =>
      pay
        .filter((p) => p.agentId === a.id && st.includes(p.status))
        .reduce((t, p) => t + Number(p._sum.amount ?? 0), 0);
    const paid = sum(["PAID"]),
      inProc = sum(["PENDING", "PROCESSING"]);
    const adjSum = Number(
      adj.find((x) => x.agentId === a.id)?._sum.amount ?? 0,
    );
    const credited = a.bloggers
      .filter((b) => b.bonusCreditedAt)
      .sort((x, y) => +x.bonusCreditedAt! - +y.bonusCreditedAt!);
    const total = credited.reduce((t, b) => t + Number(b.agentBonus), 0);

    // Payments are matched against the credited bonuses, oldest first, to know which bloggers are paid
    const status = new Map<string, string>();
    let cp = paid,
      ci = inProc;
    for (const b of credited) {
      const amt = Number(b.agentBonus);
      if (cp >= amt) {
        status.set(b.id, "PAID");
        cp -= amt;
      } else if (ci >= amt) {
        status.set(b.id, "IN PROCESS");
        ci -= amt;
      } else status.set(b.id, "DUE");
    }
    for (const b of a.bloggers)
      if (!status.has(b.id)) status.set(b.id, "WAITING");

    // Group the bloggers by the week (Monday to Sunday, IST) in which they were added
    const byWeek = new Map<number, typeof a.bloggers>();
    for (const b of a.bloggers) {
      const k = weekStartIST(b.createdAt).getTime();
      byWeek.set(k, [...(byWeek.get(k) ?? []), b]);
    }
    const weeks = [...byWeek.entries()]
      .sort((x, y) => y[0] - x[0])
      .slice(0, 12)
      .map(([k, bs]) => {
        const st = (b: { id: string }) => status.get(b.id)!;
        const paidB = bs.filter((b) => st(b) === "PAID"),
          pendB = bs.filter((b) => st(b) === "IN PROCESS" || st(b) === "DUE"),
          waitB = bs.filter((b) => st(b) === "WAITING");
        const amt = (l: typeof bs) =>
          l.reduce((t, b) => t + Number(b.agentBonus), 0);
        return {
          start: new Date(k),
          bs,
          st,
          paidB,
          pendB,
          waitB,
          paidAmt: amt(paidB),
          pendAmt: amt(pendB),
        };
      });
    return {
      a,
      weeks,
      total,
      paid,
      inProc,
      due: total + adjSum - paid - inProc,
    };
  });
  const grand = rows.reduce((t, r) => t + Math.max(r.due, 0), 0);

  return (
    <>
      <h1 className="text-xl font-semibold">Agent weekly payment</h1>
      {searchParams.msg && <p className="card text-sm">{searchParams.msg}</p>}
      <p className="text-sm text-slate-500">
        Total due to all agents: <b>₹{inr(grand)}</b>. Bloggers are grouped by
        the week they were added (Monday to Sunday). A blogger counts as{" "}
        <b>pending</b> once his commission is credited (approved account +{" "}
        {need} approved video{need > 1 ? "s" : ""}) and not paid yet. Those who
        are not eligible yet are shown separately. On Monday press{" "}
        <b>Create payment</b>, then mark it Complete on the Payments page after
        you pay.
      </p>

      {rows.map((r) => (
        <div key={r.a.id} className="card space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">
              {r.a.name} <PlanBadge code={r.a.plan?.code} />{" "}
              <span className="text-sm text-slate-500">
                · {r.a.bloggers.length} bloggers in total
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span>
                Due now: <b>₹{inr(r.due)}</b>{" "}
                <span className="text-xs text-slate-500">
                  (paid ₹{inr(r.paid)}
                  {r.inProc ? `, in process ₹${inr(r.inProc)}` : ""})
                </span>
              </span>
              {r.due > 0 ? (
                <form action={createAgentPayout}>
                  <input type="hidden" name="id" value={r.a.id} />
                  <button className="btn-g">Create payment</button>
                </form>
              ) : (
                <span className="text-xs text-slate-500">nothing due</span>
              )}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Bloggers added</th>
                <th>Paid</th>
                <th>Pending</th>
                <th>Not eligible yet</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {r.weeks.map((w) => {
                const done = w.pendB.length === 0 && w.waitB.length === 0;
                return (
                  <tr key={+w.start}>
                    <td>
                      {day(w.start)} to {day(new Date(+w.start + 6 * DAY))}
                    </td>
                    <td>
                      <b>{w.bs.length}</b>
                      <details>
                        <summary className="text-xs underline cursor-pointer">
                          Names
                        </summary>
                        {w.bs.map((b) => (
                          <div key={b.id} className="text-xs">
                            <span className={tone[w.st(b)]}>{w.st(b)}</span> ·{" "}
                            {b.name} · ₹{inr(Number(b.agentBonus))}
                          </div>
                        ))}
                      </details>
                    </td>
                    <td className="text-green-700">
                      {w.paidB.length ? (
                        <>
                          {w.paidB.length}{" "}
                          <span className="text-xs">(₹{inr(w.paidAmt)})</span>
                        </>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="text-amber-700">
                      {w.pendB.length ? (
                        <>
                          {w.pendB.length}{" "}
                          <span className="text-xs">(₹{inr(w.pendAmt)})</span>
                        </>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="text-slate-500">{w.waitB.length}</td>
                    <td>
                      {done
                        ? "✅ Paid"
                        : w.paidB.length
                          ? "Partly paid"
                          : w.pendB.length
                            ? "⏳ Pending"
                            : "Waiting"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!r.weeks.length && (
            <p className="text-sm text-slate-500">No bloggers added yet.</p>
          )}
        </div>
      ))}
      {!rows.length && <p className="text-sm text-slate-500">No agents yet.</p>}
    </>
  );
}
