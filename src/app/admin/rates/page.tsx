import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { getAgentBonus } from "@/lib/settings";
import { setAgentBonusDefault, setRate } from "../actions";
export const dynamic = "force-dynamic";
export default async function Rates() {
  await pageSuper();
  const [rates, bonus] = await Promise.all([db.rate.findMany({ orderBy: { platform: "asc" } }), getAgentBonus()]);
  return (<><h1 className="text-xl font-semibold">Rates and bonus</h1>
    <div className="card space-y-2"><h2 className="font-medium">Agent bonus per blogger added (₹)</h2><p className="text-sm text-slate-500">Applies to bloggers who join from now on. Edit one blogger's bonus on the Bloggers page.</p>
      <form action={setAgentBonusDefault} className="flex gap-2"><input name="bonus" type="number" step="0.01" min="0" defaultValue={bonus} className="inp w-28" /><button className="btn">Save</button></form></div>
    <div className="card space-y-2"><h2 className="font-medium">Blogger rate (₹ per 1,000,000 views)</h2><p className="text-sm text-slate-500">Default 800 per million. A new rate affects only future views; past earnings stay unchanged.</p>
      {rates.map(r => <form key={r.platform} action={setRate} className="flex items-center gap-2"><span className="w-28 text-sm">{r.platform}</span><input type="hidden" name="platform" value={r.platform} /><input name="rate" type="number" step="0.01" min="0" defaultValue={r.perMillion.toString()} className="inp w-28" /><button className="btn">Save</button></form>)}</div></>);
}
