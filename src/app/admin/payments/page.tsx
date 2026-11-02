import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { setPayment } from "../actions";
export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { PENDING: "Pending", PROCESSING: "In progress", PAID: "Complete", REJECTED: "Rejected" };
export default async function Payments({ searchParams }: { searchParams: { status?: string } }) {
  await pageSuper();
  const f = ["PENDING", "PROCESSING", "PAID", "REJECTED"].includes(searchParams.status ?? "") ? (searchParams.status as "PENDING") : undefined;
  const list = await db.withdrawal.findMany({ where: f ? { status: f } : {}, include: { blogger: true, agent: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return (<><h1 className="text-xl font-semibold">Payments (agents and bloggers)</h1>
    <div className="flex gap-3 text-sm"><a className="underline" href="/admin/payments">All</a>{Object.entries(LABEL).map(([k, v]) => <a key={k} className="underline" href={`?status=${k}`}>{v}</a>)}</div>
    <div className="card"><table><thead><tr><th>Date</th><th>Who</th><th>Amount ₹</th><th>Pay to</th><th>Status</th><th>Change status</th></tr></thead><tbody>
      {list.map(w => <tr key={w.id}><td>{w.createdAt.toISOString().slice(0, 10)}</td><td>{w.blogger ? "Blogger" : "Agent"}: {w.blogger?.name ?? w.agent?.name}</td><td>{w.amount.toString()}</td><td className="max-w-xs break-words">{w.details}</td><td>{LABEL[w.status]}{w.note ? <div className="text-xs text-slate-500">{w.note}</div> : null}</td>
        <td className="space-y-1"><div className="flex gap-1">
          {(["PROCESSING", "PAID"] as const).filter(s => s !== w.status).map(s => <form key={s} action={setPayment}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="status" value={s} /><button className={s === "PAID" ? "btn-g" : "btn"}>{LABEL[s]}</button></form>)}</div>
          {w.status !== "REJECTED" && w.status !== "PAID" && <form action={setPayment} className="flex gap-1"><input type="hidden" name="id" value={w.id} /><input type="hidden" name="status" value="REJECTED" /><input name="note" required minLength={2} placeholder="Reject reason" className="inp w-32" /><button className="btn-r">Reject</button></form>}</td></tr>)}
    </tbody></table></div></>);
}
