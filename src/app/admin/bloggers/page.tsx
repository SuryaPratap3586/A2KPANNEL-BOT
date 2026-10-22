import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { bloggerBalance } from "@/lib/balance";
import { assignAgent, setBloggerBonus, setBloggerStatus } from "../actions";
import AdjustForm from "../AdjustForm";
import PlanBadge from "../PlanBadge";
export const dynamic = "force-dynamic";
const fmt = (n: number) => n.toLocaleString("en-IN");

export default async function Bloggers() {
  await pageSuper();
  const [list, agents] = await Promise.all([
    db.blogger.findMany({
      where: { status: { not: "DELETED" } },
      include: { agent: { include: { plan: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.agent.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
    }),
  ]);
  const ids = list.map((b) => b.id);
  const [bal, appr, all] = await Promise.all([
    Promise.all(list.map((b) => bloggerBalance(b.id))),
    db.video.groupBy({
      by: ["bloggerId"],
      where: { bloggerId: { in: ids }, status: "APPROVED" },
      _sum: { views: true, liveViews: true, earnings: true },
      _count: { _all: true },
    }),
    db.video.groupBy({
      by: ["bloggerId"],
      where: { bloggerId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  return (
    <>
      <h1 className="text-xl font-semibold">Bloggers</h1>
      <p className="text-sm text-slate-500">
        Bloggers register by /start. Live views = fetched from the platform.
        Payable views = the number the blogger sees and is paid on (you can edit
        it on the Videos page).
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Blogger</th>
              <th>Agent</th>
              <th>Videos (approved / all)</th>
              <th>Live views</th>
              <th>Payable views</th>
              <th>Earned from views ₹</th>
              <th>Agent bonus ₹</th>
              <th>Balance ₹</th>
              <th>Adjust balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b, i) => {
              const a = appr.find((x) => x.bloggerId === b.id);
              const t = all.find((x) => x.bloggerId === b.id);
              return (
                <tr key={b.id}>
                  <td>
                    {b.name}
                    {b.username ? " @" + b.username : ""}
                    <div className="text-xs text-slate-500">
                      {b.telegramId.toString()}
                    </div>
                  </td>
                  <td>
                    <div className="text-sm font-medium">
                      {b.agent?.name ?? "No agent"}{" "}
                      <PlanBadge code={b.agent?.plan?.code} />
                    </div>
                    <form action={assignAgent} className="flex gap-1">
                      <input type="hidden" name="id" value={b.id} />
                      <select
                        name="agentId"
                        defaultValue={b.agentId ?? ""}
                        className="inp"
                      >
                        <option value="">— none —</option>
                        {agents.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <button className="btn">Set</button>
                    </form>
                  </td>
                  <td>
                    {a?._count._all ?? 0} / {t?._count._all ?? 0}
                  </td>
                  <td>{fmt(a?._sum.liveViews ?? 0)}</td>
                  <td>{fmt(a?._sum.views ?? 0)}</td>
                  <td>{Number(a?._sum.earnings ?? 0).toFixed(2)}</td>
                  <td>
                    <form action={setBloggerBonus} className="flex gap-1">
                      <input type="hidden" name="id" value={b.id} />
                      <input
                        name="bonus"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={b.agentBonus.toString()}
                        className="inp w-20"
                      />
                      <button className="btn">Save</button>
                    </form>
                  </td>
                  <td>{bal[i].toFixed(2)}</td>
                  <td>
                    <AdjustForm kind="blogger" id={b.id} />
                  </td>
                  <td>
                    <div>{b.status}</div>
                    <div className="flex gap-1 mt-1">
                      {["ACTIVE", "SUSPENDED", "DELETED"]
                        .filter((s) => s !== b.status)
                        .map((s) => (
                          <form key={s} action={setBloggerStatus}>
                            <input type="hidden" name="id" value={b.id} />
                            <input type="hidden" name="status" value={s} />
                            <button
                              className={s === "ACTIVE" ? "btn-g" : "btn-r"}
                            >
                              {s}
                            </button>
                          </form>
                        ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
