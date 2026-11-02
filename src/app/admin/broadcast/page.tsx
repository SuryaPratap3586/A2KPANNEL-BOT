import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { TARGETS, deliveryStats, targetCounts } from "@/lib/broadcast";
import { istDateTime } from "@/lib/week";
import { cancelBroadcast, retryBroadcast, sendBroadcast } from "../actions";
import Btn from "@/app/admin/Btn";
import BroadcastForm from "./BroadcastForm";
import AutoRefresh from "./AutoRefresh";
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  SENDING: "⏳ Sending",
  DONE: "✅ Done",
  CANCELLED: "⛔ Stopped",
};

// Super admin: send an announcement to bloggers and / or agents through the Telegram bots.
export default async function Broadcast({
  searchParams,
}: {
  searchParams: { msg?: string };
}) {
  await pageSuper();
  const [counts, agents, list] = await Promise.all([
    targetCounts(),
    db.agent.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, _count: { select: { bloggers: { where: { status: "ACTIVE" } } } } },
      orderBy: { name: "asc" },
    }),
    db.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const stats = await deliveryStats(list.map((b) => b.id));
  const sending = list.some((b) => b.state === "SENDING");
  const failedSamples = await db.broadcastDelivery.findMany({
    where: { broadcastId: { in: list.slice(0, 5).map((b) => b.id) }, status: "FAILED" },
    select: { broadcastId: true, error: true },
    take: 50,
  });

  return (
    <>
      <h1 className="text-xl font-semibold">Broadcast</h1>
      {searchParams.msg && <p className="card text-sm">{searchParams.msg}</p>}
      <BroadcastForm
        action={sendBroadcast}
        targets={Object.entries(TARGETS).map(([k, label]) => ({
          key: k,
          label,
          count: k === "AGENT_BLOGGERS" ? null : counts[k as "ALL" | "BLOGGERS" | "AGENTS"],
        }))}
        agents={agents.map((a) => ({ id: a.id, name: a.name, count: a._count.bloggers }))}
      />
      <p className="text-xs text-slate-500">
        Bloggers receive it from the blogger bot, agents from the agent bot. Only active users are included. Messages are sent
        by the bots process (<code>npm run bots</code> must be running) at about 20 per second per bot; Telegram rate limits are
        respected and temporary errors are retried up to 3 times. Users who blocked the bot are marked failed.
      </p>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">History</h2>
          {sending && <AutoRefresh seconds={3} />}
        </div>
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Message</th>
              <th>Target</th>
              <th>Recipients</th>
              <th>Sent</th>
              <th>Failed</th>
              <th>Waiting</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((b) => {
              const s = stats.get(b.id)!;
              const waiting = s.PENDING + s.SENDING;
              const reasons = [...new Set(failedSamples.filter((f) => f.broadcastId === b.id).map((f) => f.error ?? "unknown"))].slice(0, 3);
              const agent = b.targetId ? agents.find((a) => a.id === b.targetId)?.name : null;
              return (
                <tr key={b.id}>
                  <td>
                    {istDateTime(b.createdAt)}
                    <div className="text-xs text-slate-500">{b.createdBy}</div>
                  </td>
                  <td className="max-w-sm whitespace-pre-wrap break-words">
                    {b.message.length > 300 ? b.message.slice(0, 300) + "…" : b.message}
                  </td>
                  <td>
                    {TARGETS[b.target as keyof typeof TARGETS] ?? b.target}
                    {agent ? `: ${agent}` : ""}
                  </td>
                  <td>{b.total}</td>
                  <td className="text-green-700">{s.SENT}</td>
                  <td className="text-red-700">
                    {s.FAILED}
                    {reasons.map((r) => (
                      <div key={r} className="text-xs text-slate-500">
                        {r}
                      </div>
                    ))}
                  </td>
                  <td>{waiting}</td>
                  <td>
                    {STATE_LABEL[b.state]}
                    {b.finishedAt && (
                      <div className="text-xs text-slate-500">{istDateTime(b.finishedAt)}</div>
                    )}
                  </td>
                  <td className="space-y-1">
                    {b.state === "SENDING" && (
                      <form action={cancelBroadcast}>
                        <input type="hidden" name="id" value={b.id} />
                        <Btn className="btn-r">Stop</Btn>
                      </form>
                    )}
                    {b.state !== "SENDING" && s.FAILED > 0 && (
                      <form action={retryBroadcast}>
                        <input type="hidden" name="id" value={b.id} />
                        <Btn>Retry failed</Btn>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <p className="text-sm text-slate-500 p-2">No broadcasts yet.</p>}
      </div>
    </>
  );
}
