import { db } from "@/lib/db";
import Btn from "@/app/admin/Btn";
import { pageSuper } from "@/lib/auth";
import { agentBalances } from "@/lib/balance";
import { ensurePlans } from "@/lib/plans";
import { setAgentStatus, setAgentTelegramId, setAgentPlan } from "../actions";
import AgentForm from "./AgentForm";
import AdjustForm from "../AdjustForm";
import PlanBadge from "../PlanBadge";
export const dynamic = "force-dynamic";

export default async function Agents({
  searchParams,
}: {
  searchParams: { msg?: string };
}) {
  await pageSuper();
  const plans = await ensurePlans();
  // Bonuses are credited on approval, on account approval and by the cron, so this page only reads.
  const agents = await db.agent.findMany({
    where: { status: { not: "DELETED" } },
    include: { plan: true, _count: { select: { bloggers: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const [bal, comm] = await Promise.all([
    agentBalances(agents.map((a) => a.id)), // 3 queries for the whole list
    db.blogger.groupBy({
      by: ["agentId"],
      where: {
        agentId: { not: null },
        status: { not: "DELETED" },
        bonusCreditedAt: { not: null },
      },
      _sum: { agentBonus: true },
      _count: { _all: true },
    }),
  ]);
  const planOpts = plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    agentBonus: Number(p.agentBonus),
    bloggerPerMillion: Number(p.bloggerPerMillion),
  }));
  return (
    <>
      <h1 className="text-xl font-semibold">Agents</h1>
      {searchParams.msg && <p className="card text-sm">{searchParams.msg}</p>}
      <AgentForm plans={planOpts} />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Plan</th>
              <th>Telegram ID</th>
              <th>Bloggers</th>
              <th>Commission earned ₹</th>
              <th>Balance ₹</th>
              <th>Status</th>
              <th>Payment details</th>
              <th>Adjust balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.name} <PlanBadge code={a.plan?.code} />
                </td>
                <td>
                  <form action={setAgentPlan} className="flex gap-1">
                    <input type="hidden" name="id" value={a.id} />
                    <select
                      name="planId"
                      defaultValue={a.planId ?? ""}
                      className="inp"
                    >
                      <option value="">— no plan —</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · ₹{p.agentBonus.toString()} / ₹
                          {p.bloggerPerMillion.toString()}
                        </option>
                      ))}
                    </select>
                    <Btn className="btn">Set</Btn>
                  </form>
                </td>
                <td>
                  <form action={setAgentTelegramId} className="flex gap-1">
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      name="telegramId"
                      inputMode="numeric"
                      pattern="\d{5,15}"
                      defaultValue={a.telegramId?.toString() ?? ""}
                      placeholder="not set"
                      className="inp w-32"
                    />
                    <Btn className="btn">Save</Btn>
                  </form>
                </td>
                <td>
                  {a._count.bloggers}{" "}
                  <span className="text-xs text-slate-500">
                    ({comm.find((c) => c.agentId === a.id)?._count._all ?? 0}{" "}
                    credited)
                  </span>
                </td>
                <td>
                  {Number(
                    comm.find((c) => c.agentId === a.id)?._sum.agentBonus ?? 0,
                  ).toFixed(2)}
                </td>
                <td>{(bal.get(a.id) ?? 0).toFixed(2)}</td>
                <td>{a.status}</td>
                <td className="max-w-xs truncate">{a.bankDetails ?? "-"}</td>
                <td>
                  <AdjustForm kind="agent" id={a.id} />
                </td>
                <td className="flex gap-1">
                  {["ACTIVE", "SUSPENDED", "DELETED"]
                    .filter((s) => s !== a.status)
                    .map((s) => (
                      <form key={s} action={setAgentStatus}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value={s} />
                        <Btn className={s === "ACTIVE" ? "btn-g" : "btn-r"}>
                          {s}
                        </Btn>
                      </form>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
