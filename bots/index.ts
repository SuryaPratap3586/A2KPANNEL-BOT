import "dotenv/config";
import dns from "dns";
import net from "net";
import { Telegraf } from "telegraf";
import { db } from "../src/lib/db";
import { agentBot } from "./agentBot";
import { bloggerBot } from "./bloggerBot";
import { WEBAPP_URL } from "./common";

// Some Windows / Wi-Fi networks reset IPv6 connections to Telegram (ECONNRESET). Prefer IPv4 everywhere.
dns.setDefaultResultOrder("ipv4first");
(net as any).setDefaultAutoSelectFamily?.(false);
process.on("unhandledRejection", (e: any) =>
  console.error("network problem:", e?.code ?? "unknown"),
); // never print the error text: it contains the bot token

const a = process.env.AGENT_BOT_TOKEN?.trim(),
  b = process.env.BLOGGER_BOT_TOKEN?.trim();
if (!a || !b) throw new Error("Set AGENT_BOT_TOKEN and BLOGGER_BOT_TOKEN");
if (a === b)
  throw new Error(
    "AGENT_BOT_TOKEN and BLOGGER_BOT_TOKEN are the same token. Each bot needs its own token from BotFather.",
  );

// Measures how far the database is from this server. "one query" is the time of a single round trip:
// about 1-5 ms = same region (fast), 100-300 ms = different region (every bot reply feels slow).
const t0 = Date.now();
db.$queryRaw`SELECT 1`
  .then(async () => {
    const first = Date.now() - t0,
      t1 = Date.now();
    await db.$queryRaw`SELECT 1`;
    console.log(
      `database ready: first connection ${first} ms, one query ${Date.now() - t1} ms`,
    );
  })
  .catch(() => console.error("database not reachable yet"));

// Optional keep-alive (minutes, 0 = off). Off by default: on the free Neon plan an always-awake database uses about 180 of the 100 free compute hours a month.
const keep = Number(process.env.DB_KEEPALIVE_MINUTES ?? 0);
if (keep > 0)
  setInterval(() => {
    db.$queryRaw`SELECT 1`.catch(() => {});
  }, keep * 60_000);

const running = new Set<Telegraf>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts a bot and keeps retrying while Telegram cannot be reached. */
async function run(name: string, make: () => Telegraf) {
  for (;;) {
    const bot = make();
    running.add(bot);
    try {
      await bot.launch(() => {
        // runs once the bot is connected; launch() itself returns only when the bot stops
        console.log(`${name} bot started (@${bot.botInfo?.username ?? "?"})`);
        if (WEBAPP_URL)
          bot.telegram
            .setChatMenuButton({
              menuButton: {
                type: "web_app",
                text: "Open App",
                web_app: { url: WEBAPP_URL },
              },
            })
            .catch(() => {});
      });
      return; // stopped on purpose (Ctrl + C)
    } catch (e: any) {
      running.delete(bot);
      if (e?.code === 409) {
        console.error(
          `${name} bot: 409 Conflict. The same bot is already running somewhere else (another terminal, your laptop or the EC2 server). Stop the other copy. Retrying in 30 seconds...`,
        );
        await sleep(30_000);
      } else {
        console.error(
          `${name} bot: cannot reach Telegram (${e?.code ?? "network error"}). Retrying in 10 seconds...`,
        );
        await sleep(10_000);
      }
    }
  }
}

run("Agent", () => agentBot(a));
run("Blogger", () => bloggerBot(b));
const stop = (sig: string) =>
  running.forEach((x) => {
    try {
      x.stop(sig);
    } catch {}
  });
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
