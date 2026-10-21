import "dotenv/config";
import dns from "dns";
import net from "net";
import { Telegraf } from "telegraf";
import { agentBot } from "./agentBot";
import { bloggerBot } from "./bloggerBot";

// Some Windows / Wi-Fi networks reset IPv6 connections to Telegram (ECONNRESET). Prefer IPv4 everywhere.
dns.setDefaultResultOrder("ipv4first");
(net as any).setDefaultAutoSelectFamily?.(false);
process.on("unhandledRejection", (e: any) =>
  console.error("network problem:", e?.code ?? "unknown"),
); // never print the error text: it contains the bot token

const a = process.env.AGENT_BOT_TOKEN,
  b = process.env.BLOGGER_BOT_TOKEN;
if (!a || !b) throw new Error("Set AGENT_BOT_TOKEN and BLOGGER_BOT_TOKEN");

const running = new Set<Telegraf>();

/** Starts a bot and keeps retrying every 10 seconds while Telegram cannot be reached. */
async function run(name: string, make: () => Telegraf) {
  for (;;) {
    const bot = make();
    running.add(bot);
    try {
      await bot.launch(() => {
        // runs once the bot is connected; launch() itself returns only when the bot stops
        console.log(`${name} bot started`);
        if (process.env.WEBAPP_URL)
          bot.telegram
            .setChatMenuButton({
              menuButton: {
                type: "web_app",
                text: "Open App",
                web_app: { url: process.env.WEBAPP_URL },
              },
            })
            .catch(() => {});
      });
      return; // stopped on purpose (Ctrl + C)
    } catch (e: any) {
      running.delete(bot);
      console.error(
        `${name} bot: cannot reach Telegram (${e?.code ?? "network error"}). Retrying in 10 seconds...`,
      );
      await new Promise((r) => setTimeout(r, 10_000));
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
