import https from "https";
import { Context, Middleware } from "telegraf";
import { RateLimiter } from "../src/lib/security";

const limiter = new RateLimiter(30, 60_000); // 30 msgs/min per user
export const rateLimit: Middleware<Context> = async (ctx, next) => {
  const id = ctx.from?.id;
  if (!id) return;
  if (!limiter.allow(String(id))) return; // silently drop floods
  return next();
};

// Only private chats are served (no groups/channels).
export const privateOnly: Middleware<Context> = async (ctx, next) => {
  if (ctx.chat?.type !== "private") return;
  return next();
};

export const esc = (s: string) =>
  s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
export const state = new Map<
  number,
  { step: string; data?: Record<string, string> }
>();

// Telegram connections over IPv6 are reset on some Windows / Wi-Fi setups (ECONNRESET). This agent forces IPv4.
// keepAlive re-uses connections, but a connection that stays idle is dropped silently by AWS / the network after a few minutes and the next message then hangs:
// idle connections are therefore closed after 15 s (the busy long-poll connection is not touched).
export const tgAgent = new https.Agent({
  family: 4,
  keepAlive: true,
  timeout: 15_000,
});

/** Keeps a database answer in memory for a short time so repeated button clicks do not wait for the database again. Empty answers are not cached. */
const memo = new Map<string, { v: unknown; t: number }>();
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const c = memo.get(key);
  if (c && Date.now() - c.t < ttlMs) return c.v as T;
  const v = await load();
  if (v) memo.set(key, { v, t: Date.now() });
  return v;
}
export const dropCache = (key: string) => {
  memo.delete(key);
};

/** Web App button link. Telegram accepts only a valid https link: a wrong value (http://, localhost, quotes, spaces) made every reply that carries
 *  the menu fail with error 400, so the message (for example the blogger link) never arrived. A wrong value now just hides the Open App button. */
export const WEBAPP_URL = (() => {
  const raw = (process.env.WEBAPP_URL ?? "").trim().replace(/^["']|["']$/g, "");
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" && u.hostname.includes("."))
      return u.toString();
  } catch {}
  console.error(
    "WEBAPP_URL is not a valid https link, so the Open App button is hidden. Fix it in .env, e.g. https://your-domain.com/app",
  );
  return "";
})();

/** If Telegram refuses a message because of its buttons (error 400), the same message is sent again without buttons, so the text always arrives. */
export const safeReply: Middleware<Context> = async (ctx, next) => {
  const orig = ctx.reply.bind(ctx);
  (ctx as any).reply = async (text: string, extra?: any) => {
    try {
      return await orig(text, extra);
    } catch (e: any) {
      if (e?.code === 400 && extra) {
        console.error("Telegram rejected the buttons:", e?.description ?? 400);
        return orig(text);
      }
      throw e;
    }
  };
  return next();
};

/** Logs every update that takes longer than 1.5 s ("slow update: 2300 ms"), so you can see in the logs whether the bot is really slow. */
export const timing: Middleware<Context> = async (ctx, next) => {
  const t = Date.now();
  try {
    await next();
  } finally {
    const ms = Date.now() - t;
    if (ms > 1500) console.log(`slow update: ${ms} ms (${ctx.updateType})`);
  }
};

/** Runs a Telegram call without ever stopping the handler: errors, also the ones thrown at once, are ignored. */
export const quiet = (f: () => unknown) => {
  try {
    const r: any = f();
    r?.catch?.(() => {});
  } catch {}
};

/** Every update runs in the background: Telegraf waits for ALL handlers of a batch before it asks Telegram for new messages, so one stuck request
 *  (slow database, hanging connection) used to delay the replies of everybody else. */
export const background: Middleware<Context> = (ctx, next) => {
  next().catch((e: any) =>
    console.error(
      "update failed:",
      e?.description ?? e?.code ?? e?.name ?? "error",
    ),
  );
};

/** A handler that has not finished after 25 s is stopped, and the user is told to try again instead of waiting for ever. */
export const withTimeout = <T>(p: Promise<T>, ms = 25_000): Promise<T> =>
  Promise.race([
    p,
    new Promise<never>((_, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), ms);
      p.finally(() => clearTimeout(t)).catch(() => {});
    }),
  ]);
