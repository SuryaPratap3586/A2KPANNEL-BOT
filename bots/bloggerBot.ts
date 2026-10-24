import { Telegraf, Markup } from "telegraf";
import { db } from "../src/lib/db";
import { registerBlogger, setLang, submitVideo } from "../src/lib/services";
import { detectPlatform } from "../src/lib/platforms";
import { Lang, tr } from "../src/lib/i18n";
import {
  background,
  privateOnly,
  quiet,
  rateLimit,
  safeReply,
  timing,
  tgAgent,
  WEBAPP_URL,
  withTimeout,
} from "./common";

// Blogger bot: /start registers the blogger. Everything else is in the Mini App.
const menu = (l: Lang) =>
  Markup.inlineKeyboard([
    ...(WEBAPP_URL
      ? [[Markup.button.webApp(tr(l, "openApp"), WEBAPP_URL)]]
      : []),
    [Markup.button.callback(tr(l, "language"), "lang")],
  ]);

const safe = (fn: (ctx: any) => Promise<unknown>) => async (ctx: any) => {
  quiet(() => ctx.callbackQuery && ctx.answerCbQuery()); // the button stops spinning at once (only buttons can be answered: for a normal message this call throws)
  quiet(() => ctx.sendChatAction("typing")); // "typing..." shows instantly while the work is done
  try {
    await withTimeout(fn(ctx));
  } catch (e: any) {
    console.error(
      "blogger bot action failed:",
      e?.description ?? e?.code ?? e?.name ?? "error",
    );
    ctx.reply("⚠️ Something went wrong, please try again.").catch(() => {});
  }
};

// Telegram ids of agents (cached for a minute): an agent account must not be used as a blogger
const agentCache = new Map<number, { agent: boolean; lang: Lang; t: number }>();

export function bloggerBot(token: string) {
  const bot = new Telegraf(token, { telegram: { agent: tgAgent } });
  bot.use(background, timing, privateOnly, rateLimit, safeReply);

  bot.use(async (ctx, next) => {
    const id = ctx.from?.id;
    if (!id) return next();
    let c = agentCache.get(id);
    if (!c || Date.now() - c.t > 60_000) {
      const a = await db.agent.findFirst({
        where: { telegramId: BigInt(id) },
        select: { lang: true },
      });
      c = { agent: !!a, lang: (a?.lang ?? "EN") as Lang, t: Date.now() };
      agentCache.set(id, c);
    }
    if (!c.agent) return next();
    if (ctx.callbackQuery)
      ctx
        .answerCbQuery(tr(c.lang, "accessDenied"), { show_alert: true })
        .catch(() => {});
    else await ctx.reply(tr(c.lang, "accessDenied"));
  });

  bot.start(
    safe(async (ctx) => {
      const code =
        (ctx.message?.text?.split(/\s+/)[1] ?? ctx.payload ?? "").trim() ||
        undefined; // the agent link code: /start <code>
      const r = await registerBlogger(ctx.from, code);
      console.log(
        `start: code=${code ? "yes" : "no"} result=${r.status} newBlogger=${r.created} agent=${r.agentName ?? (r.blogger.agentId ? "already set" : "none")}`,
      ); // no secrets: shows whether the agent link worked
      const l = r.blogger.lang;
      if (r.blogger.status !== "ACTIVE") return ctx.reply(tr(l, "suspended"));
      let msg = r.created ? tr(l, "registered") : tr(l, "welcomeBack");
      if (r.status === "ALREADY") msg = tr(l, "alreadyAssigned");
      if (r.status === "BADLINK") msg += "\n" + tr(l, "badLink");
      if (r.agentName) msg += "\n" + tr(l, "underAgent", { name: r.agentName });
      await ctx.reply(msg, menu(l));
    }),
  );

  bot.action(
    "lang",
    safe(async (ctx) => {
      const b = await db.blogger.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });
      if (!b) return;
      await ctx.reply(
        tr(b.lang, "chooseLang"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback("English", "setlang:EN"),
            Markup.button.callback("हिंदी", "setlang:HI"),
          ],
        ]),
      );
    }),
  );
  bot.action(
    /^setlang:(EN|HI)$/,
    safe(async (ctx) => {
      const b = await db.blogger.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });
      if (!b) return;
      const l = ctx.match[1] as Lang;
      await setLang({ bloggerId: b.id }, l);
      await ctx.reply(tr(l, "langSet"), menu(l));
    }),
  );

  // A blogger can also paste a video link in the chat to submit it (same rules as the app: Mon-Fri, linked account, no duplicates)
  bot.on(
    "text",
    safe(async (ctx) => {
      const { blogger } = await registerBlogger(ctx.from);
      const l = blogger.lang;
      if (blogger.status !== "ACTIVE") return ctx.reply(tr(l, "suspended"));
      const m = ctx.message.text.match(/https?:\/\/\S+/i);
      if (!m) return ctx.reply(tr(l, "pasteLink"), menu(l));
      const platform = detectPlatform(m[0]);
      if (!platform) return ctx.reply("❌ " + tr(l, "e_badUrl"));
      const r = await submitVideo(blogger.id, platform, m[0]);
      if ("error" in r) return ctx.reply("❌ " + tr(l, r.error));
      await ctx.reply(
        "✅ " + tr(l, r.unverified ? "unverifiedNote" : "submitted"),
        menu(l),
      );
    }),
  );

  bot.on(
    "message",
    safe(async (ctx) => {
      // anything else -> point to the app
      const b = await db.blogger.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });
      await ctx.reply(tr(b?.lang ?? "EN", "pasteLink"), menu(b?.lang ?? "EN"));
    }),
  );

  bot.catch((e: any) =>
    console.error("blogger bot error:", e?.code ?? e?.name ?? "error"),
  );
  return bot;
}
