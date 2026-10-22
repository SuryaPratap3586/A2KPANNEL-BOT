import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { getAgentBonus } from "@/lib/settings";
import { ensurePlans } from "@/lib/plans";
import {
  createPlan,
  savePlan,
  setAgentBonusDefault,
  setRate,
} from "../actions";
import PlanBadge from "../PlanBadge";
export const dynamic = "force-dynamic";

export default async function Rates({
  searchParams,
}: {
  searchParams: { msg?: string };
}) {
  await pageSuper();
  const [rates, bonus, plans] = await Promise.all([
    db.rate.findMany({ orderBy: { platform: "asc" } }),
    getAgentBonus(),
    ensurePlans(),
  ]);
  return (
    <>
      <h1 className="text-xl font-semibold">Plans, rates and bonus</h1>
      {searchParams.msg && <p className="card text-sm">{searchParams.msg}</p>}

      <div className="card space-y-2">
        <h2 className="font-medium">Plans (D / S)</h2>
        <p className="text-sm text-slate-500">
          Each agent gets a plan when you create him (Agents page). The plan
          decides what the <b>agent earns per blogger</b> and what{" "}
          <b>his bloggers earn per 1,000,000 views</b>. Editing a plan affects
          only new bloggers and new views, old earnings stay unchanged.
        </p>
        <table>
          <thead>
            <tr>
              <th>Mark</th>
              <th>Name</th>
              <th>Agent bonus per blogger ₹</th>
              <th>Blogger rate ₹ per 1M views</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>
                  <PlanBadge code={p.code} />
                </td>
                <td colSpan={4}>
                  <form
                    action={savePlan}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <input
                      name="name"
                      defaultValue={p.name}
                      className="inp w-32"
                    />
                    <input
                      name="agentBonus"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={p.agentBonus.toString()}
                      className="inp w-28"
                    />
                    <input
                      name="bloggerPerMillion"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={p.bloggerPerMillion.toString()}
                      className="inp w-28"
                    />
                    <button className="btn">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          action={createPlan}
          className="flex flex-wrap items-end gap-2 pt-2 border-t"
        >
          <span className="text-sm w-full font-medium">Add another plan</span>
          <input
            name="code"
            required
            maxLength={3}
            placeholder="Mark (e.g. X)"
            className="inp w-28"
          />
          <input name="name" required placeholder="Name" className="inp w-32" />
          <input
            name="agentBonus"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="Agent ₹"
            className="inp w-28"
          />
          <input
            name="bloggerPerMillion"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="Blogger ₹/1M"
            className="inp w-28"
          />
          <button className="btn">Add plan</button>
        </form>
      </div>

      <div className="card space-y-2">
        <h2 className="font-medium">
          Agents without a plan: bonus per blogger (₹)
        </h2>
        <p className="text-sm text-slate-500">
          Used only for old agents that have no plan yet.
        </p>
        <form action={setAgentBonusDefault} className="flex gap-2">
          <input
            name="bonus"
            type="number"
            step="0.01"
            min="0"
            defaultValue={bonus}
            className="inp w-28"
          />
          <button className="btn">Save</button>
        </form>
      </div>

      <div className="card space-y-2">
        <h2 className="font-medium">
          Bloggers without an agent plan: rate (₹ per 1,000,000 views)
        </h2>
        <p className="text-sm text-slate-500">
          Used for bloggers who joined without an agent, or whose agent has no
          plan.
        </p>
        {rates.map((r) => (
          <form
            key={r.platform}
            action={setRate}
            className="flex items-center gap-2"
          >
            <span className="w-28 text-sm">{r.platform}</span>
            <input type="hidden" name="platform" value={r.platform} />
            <input
              name="rate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={r.perMillion.toString()}
              className="inp w-28"
            />
            <button className="btn">Save</button>
          </form>
        ))}
      </div>
    </>
  );
}
