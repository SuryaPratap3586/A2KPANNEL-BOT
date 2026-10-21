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
export const tgAgent = new https.Agent({ family: 4, keepAlive: true });
