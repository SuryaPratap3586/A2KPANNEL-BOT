"use client";
import { useFormState } from "react-dom";
import { createAgent } from "../actions";

type S = { token: string | null; error?: string; linked?: boolean };

export default function AgentForm() {
  const [s, act] = useFormState<S, FormData>(createAgent, { token: null });
  return (
    <div className="card space-y-2">
      <form action={act} className="flex flex-wrap gap-2 items-end">
        <input name="name" required minLength={2} placeholder="Agent name" className="inp" />
        <input name="telegramId" inputMode="numeric" pattern="\d{5,15}" placeholder="Telegram ID (optional)" className="inp" />
        <button className="btn">Create agent</button>
      </form>
      <p className="text-xs text-slate-500">Telegram ID bharoge to agent ko bot mein sirf /start karna hoga. Khaali chhodoge to agent token paste karke login karega. Agent apni ID @userinfobot se le sakta hai.</p>
      {s.error && <p className="text-sm text-red-600">{s.error}</p>}
      {s.token && (
        <p className="text-sm">
          {s.linked ? "Telegram ID linked: agent sirf /start kare. " : ""}Token (copy now, shown once):{" "}
          <code className="bg-amber-100 px-2 py-1 rounded select-all">{s.token}</code>
        </p>
      )}
    </div>
  );
}
