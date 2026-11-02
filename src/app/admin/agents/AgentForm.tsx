"use client";
import { useFormState } from "react-dom";
import { createAgent } from "../actions";

type S = {
  token: string | null;
  error?: string;
  linked?: boolean;
  plan?: string;
};
type PlanOpt = {
  id: string;
  code: string;
  name: string;
  agentBonus: number;
  bloggerPerMillion: number;
};

export default function AgentForm({ plans }: { plans: PlanOpt[] }) {
  const [s, act] = useFormState<S, FormData>(createAgent, { token: null });
  return (
    <div className="card space-y-2">
      <form action={act} className="flex flex-wrap gap-2 items-end">
        <input
          name="name"
          required
          minLength={2}
          placeholder="Agent name"
          className="inp"
        />
        <select name="planId" required className="inp" defaultValue="">
          <option value="" disabled>
            Choose plan
          </option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · agent ₹{p.agentBonus} · blogger ₹{p.bloggerPerMillion}
              /million
            </option>
          ))}
        </select>
        <input
          name="telegramId"
          inputMode="numeric"
          pattern="\d{5,15}"
          placeholder="Telegram ID (optional)"
          className="inp"
        />
        <button className="btn">Create agent + token</button>
      </form>
      <p className="text-xs text-slate-500">
        The plan (D / S) decides the agent bonus per blogger and the blogger
        rate. Telegram ID bharoge to agent ko bot mein sirf /start karna hoga,
        warna token paste karega.
      </p>
      {s.error && <p className="text-sm text-red-600">{s.error}</p>}
      {s.token && (
        <p className="text-sm">
          {s.plan ? <>Plan {s.plan}. </> : null}
          {s.linked ? "Telegram ID linked: agent sirf /start kare. " : ""}Token
          (copy now, shown once):{" "}
          <code className="bg-amber-100 px-2 py-1 rounded select-all">
            {s.token}
          </code>
        </p>
      )}
    </div>
  );
}
