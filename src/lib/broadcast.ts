// Broadcast: the admin writes a message, recipients are saved as delivery rows, and a worker (running inside `npm run bots`)
// sends them through the right bot. Safe with Telegram limits: ~20 messages / second per bot, 429 "retry after" is respected,
// temporary errors are retried (max 3 attempts), users who blocked the bot are marked failed at once.
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { tgMessage } from "./notify";

export const TARGETS = {
  ALL: "All bloggers and agents",
  BLOGGERS: "All bloggers",
  AGENTS: "All agents",
  AGENT_BLOGGERS: "Bloggers of one agent",
} as const;
export type Target = keyof typeof TARGETS;
const MAX_ATTEMPTS = 3;
const GAP_MS = 50; // 20 msgs / second per bot (Telegram allows about 30)

type Rcpt = { bot: "BLOGGER" | "AGENT"; chatId: bigint };

/** Active users of the target. Bloggers get the message from the blogger bot, agents from the agent bot. */
export async function recipients(target: Target, agentId?: string | null): Promise<Rcpt[]> {
  const out: Rcpt[] = [];
  if (target === "ALL" || target === "BLOGGERS" || target === "AGENT_BLOGGERS") {
    const bs = await db.blogger.findMany({
      where: { status: "ACTIVE", ...(target === "AGENT_BLOGGERS" ? { agentId: agentId ?? "-" } : {}) },
      select: { telegramId: true },
    });
    for (const b of bs) out.push({ bot: "BLOGGER", chatId: b.telegramId });
  }
  if (target === "ALL" || target === "AGENTS") {
    const as = await db.agent.findMany({ where: { status: "ACTIVE", telegramId: { not: null } }, select: { telegramId: true } });
    for (const a of as) out.push({ bot: "AGENT", chatId: a.telegramId! });
  }
  return out;
}

/** Number of recipients per target (shown before sending). */
export async function targetCounts() {
  const [b, a] = await Promise.all([
    db.blogger.count({ where: { status: "ACTIVE" } }),
    db.agent.count({ where: { status: "ACTIVE", telegramId: { not: null } } }),
  ]);
  return { ALL: a + b, BLOGGERS: b, AGENTS: a };
}

/** Creates the broadcast and all its delivery rows. Sending starts within a few seconds in the bots process. */
export async function createBroadcast(message: string, target: Target, agentId: string | null, createdBy: string) {
  const list = await recipients(target, agentId);
  const b = await db.broadcast.create({ data: { message, target, targetId: agentId, createdBy, total: list.length, state: list.length ? "SENDING" : "DONE", finishedAt: list.length ? null : new Date() } });
  for (let i = 0; i < list.length; i += 5000)
    await db.broadcastDelivery.createMany({ data: list.slice(i, i + 5000).map((r) => ({ broadcastId: b.id, bot: r.bot, chatId: r.chatId })), skipDuplicates: true });
  return b;
}

type Claimed = { id: string; broadcastId: string; bot: string; chatId: bigint; attempts: number; message: string };

/** Atomically claims up to `n` due deliveries (several workers never send the same message twice). */
async function claim(n: number): Promise<Claimed[]> {
  return db.$queryRaw<Claimed[]>(Prisma.sql`
    UPDATE "BroadcastDelivery" d SET "status" = 'SENDING', "lockedAt" = now()
    FROM "Broadcast" b
    WHERE d."broadcastId" = b."id" AND d."id" IN (
      SELECT x."id" FROM "BroadcastDelivery" x JOIN "Broadcast" y ON y."id" = x."broadcastId"
      WHERE y."state" = 'SENDING' AND (
        (x."status" = 'PENDING' AND x."nextTryAt" <= now()) OR
        (x."status" = 'SENDING' AND x."lockedAt" < now() - interval '5 minutes'))
      ORDER BY x."nextTryAt" LIMIT ${n} FOR UPDATE OF x SKIP LOCKED)
    RETURNING d."id", d."broadcastId", d."bot", d."chatId", d."attempts", b."message"`);
}

/** Marks broadcasts whose deliveries are all finished as DONE. */
async function finish() {
  await db.$executeRaw`UPDATE "Broadcast" b SET "state" = 'DONE', "finishedAt" = now()
    WHERE b."state" = 'SENDING' AND NOT EXISTS (
      SELECT 1 FROM "BroadcastDelivery" d WHERE d."broadcastId" = b."id" AND d."status" IN ('PENDING','SENDING'))`;
}

/** Sends one batch. Returns how many messages were handled. */
export async function processBroadcasts(tokens: { BLOGGER?: string; AGENT?: string }, batch = 100): Promise<number> {
  const rows = await claim(batch);
  const pause = new Map<string, number>(); // bot -> wait until (429)
  for (const r of rows) {
    const bot = r.bot as "BLOGGER" | "AGENT";
    const token = tokens[bot];
    const wait = (pause.get(bot) ?? 0) - Date.now();
    if (!token || wait > 0) {
      // bot token missing or bot is rate limited: put back without using an attempt
      await db.broadcastDelivery.update({ where: { id: r.id }, data: { status: token ? "PENDING" : "FAILED", lockedAt: null, nextTryAt: new Date(Date.now() + Math.max(wait, 0)), ...(token ? {} : { error: "bot token not set" }) } });
      continue;
    }
    const res = await tgMessage(token, r.chatId, r.message);
    const attempts = r.attempts + 1;
    if (res.ok) {
      await db.broadcastDelivery.update({ where: { id: r.id }, data: { status: "SENT", attempts, sentAt: new Date(), lockedAt: null, error: null } });
    } else if (res.code === 429) {
      const ms = (res.retryAfter ?? 5) * 1000;
      pause.set(bot, Date.now() + ms);
      await db.broadcastDelivery.update({ where: { id: r.id }, data: { status: "PENDING", lockedAt: null, nextTryAt: new Date(Date.now() + ms), error: "rate limited" } }); // not counted as an attempt
    } else {
      const final = res.code === 403 || res.code === 400 || attempts >= MAX_ATTEMPTS; // blocked bot / chat not found = no point in retrying
      await db.broadcastDelivery.update({ where: { id: r.id }, data: { status: final ? "FAILED" : "PENDING", attempts, lockedAt: null, error: `${res.code || ""} ${res.description}`.trim(), nextTryAt: new Date(Date.now() + 30_000 * attempts) } });
    }
    await new Promise((ok) => setTimeout(ok, GAP_MS));
  }
  await finish();
  return rows.length;
}

/** Background loop for the bots process. */
export function startBroadcastWorker(tokens: { BLOGGER?: string; AGENT?: string }) {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      while ((await processBroadcasts(tokens)) > 0) {} // keep going while there is work
    } catch (e: any) {
      console.error("broadcast worker:", e?.code ?? e?.name ?? "error");
    } finally {
      busy = false;
    }
  }, 3000);
}

/** Delivery numbers per broadcast for the admin page. */
export async function deliveryStats(ids: string[]) {
  const g = await db.broadcastDelivery.groupBy({ by: ["broadcastId", "status"], where: { broadcastId: { in: ids } }, _count: { _all: true } });
  const out = new Map<string, Record<"PENDING" | "SENDING" | "SENT" | "FAILED", number>>();
  for (const id of ids) out.set(id, { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0 });
  for (const r of g) out.get(r.broadcastId)![r.status] = r._count._all;
  return out;
}
