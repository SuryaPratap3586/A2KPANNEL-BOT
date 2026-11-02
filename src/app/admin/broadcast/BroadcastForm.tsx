"use client";
import { useState } from "react";
import Btn from "@/app/admin/Btn";

type T = { key: string; label: string; count: number | null };
type A = { id: string; name: string; count: number };

// Write the message, pick who gets it, see the number of recipients, confirm before sending.
export default function BroadcastForm({
  action,
  targets,
  agents,
}: {
  action: (fd: FormData) => Promise<void>;
  targets: T[];
  agents: A[];
}) {
  const [target, setTarget] = useState("BLOGGERS");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [text, setText] = useState("");
  const count =
    target === "AGENT_BLOGGERS"
      ? (agents.find((a) => a.id === agentId)?.count ?? 0)
      : (targets.find((t) => t.key === target)?.count ?? 0);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Send this message to ${count} recipient(s)? It cannot be taken back.`)) e.preventDefault();
      }}
      className="card space-y-2 max-w-2xl"
    >
      <h2 className="font-medium">New broadcast</h2>
      <textarea
        name="message"
        required
        minLength={2}
        maxLength={4000}
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your announcement (plain text, emojis are fine)"
        className="inp w-full"
      />
      <div className="text-xs text-slate-500 text-right">{text.length} / 4000</div>
      <div className="flex flex-wrap items-center gap-2">
        <select name="target" value={target} onChange={(e) => setTarget(e.target.value)} className="inp">
          {targets.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
              {t.count !== null ? ` (${t.count})` : ""}
            </option>
          ))}
        </select>
        {target === "AGENT_BLOGGERS" && (
          <select name="agentId" value={agentId} onChange={(e) => setAgentId(e.target.value)} className="inp" required>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.count})
              </option>
            ))}
          </select>
        )}
        <span className="text-sm">
          Recipients: <b>{count}</b>
        </span>
        <Btn className="btn-g" disabled={!count || text.trim().length < 2}>
          Send broadcast
        </Btn>
      </div>
    </form>
  );
}
