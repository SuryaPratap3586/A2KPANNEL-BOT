import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { agentBalance } from "@/lib/balance";
import { setAgentStatus, setAgentTelegramId } from "../actions";
import AgentForm from "./AgentForm";
import AdjustForm from "../AdjustForm";
export const dynamic = "force-dynamic";

export default async function Agents({ searchParams }: { searchParams: { msg?: string } }) {
  await pageSuper();
  const agents = await db.agent.findMany({ where: { status: { not: "DELETED" } }, include: { _count: { select: { bloggers: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const [bal, comm] = await Promise.all([
    Promise.all(agents.map((a) => agentBalance(a.id))),
    db.blogger.groupBy({ by: ["agentId"], where: { agentId: { not: null }, status: { not: "DELETED" } }, _sum: { agentBonus: true } }),
  ]);
  return (<><h1 className="text-xl font-semibold">Agents</h1>
    {searchParams.msg && <p className="card text-sm">{searchParams.msg}</p>}
    <AgentForm />
    <div className="card"><table><thead><tr><th>Name</th><th>Telegram ID</th><th>Bloggers</th><th>Commission earned ₹</th><th>Balance ₹</th><th>Status</th><th>Payment details</th><th>Adjust balance</th><th /></tr></thead><tbody>
      {agents.map((a, i) => <tr key={a.id}><td>{a.name}</td>
        <td><form action={setAgentTelegramId} className="flex gap-1"><input type="hidden" name="id" value={a.id} /><input name="telegramId" inputMode="numeric" pattern="\d{5,15}" defaultValue={a.telegramId?.toString() ?? ""} placeholder="not set" className="inp w-32" /><button className="btn">Save</button></form></td>
        <td>{a._count.bloggers}</td><td>{Number(comm.find((c) => c.agentId === a.id)?._sum.agentBonus ?? 0).toFixed(2)}</td><td>{bal[i].toFixed(2)}</td><td>{a.status}</td><td className="max-w-xs truncate">{a.bankDetails ?? "-"}</td><td><AdjustForm kind="agent" id={a.id} /></td>
        <td className="flex gap-1">{["ACTIVE","SUSPENDED","DELETED"].filter(s => s !== a.status).map(s => <form key={s} action={setAgentStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value={s} /><button className={s === "ACTIVE" ? "btn-g" : "btn-r"}>{s}</button></form>)}</td></tr>)}
    </tbody></table></div></>);
}
