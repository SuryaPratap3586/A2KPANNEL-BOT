import { adjust } from "./actions";
// Admin: add (+) or deduct (-) money for an agent or blogger, with a reason (saved in audit log).
export default function AdjustForm({ kind, id }: { kind: "agent" | "blogger"; id: string }) {
  return (<form action={adjust} className="flex gap-1">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
    <input name="amount" type="number" step="0.01" required placeholder="+/- ₹" className="inp w-24" />
    <input name="reason" required minLength={2} placeholder="Reason" className="inp w-32" />
    <button className="btn">Adjust</button></form>);
}
