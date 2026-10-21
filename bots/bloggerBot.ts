import { Telegraf, Markup } from "telegraf";
import { db } from "../src/lib/db";
import { registerBlogger, setLang, submitVideo } from "../src/lib/services";
import { detectPlatform } from "../src/lib/platforms";
import { Lang, tr } from "../src/lib/i18n";
import { privateOnly, rateLimit, tgAgent } from "./common";

// Blogger bot: /start registers the blogger. Everything else is in the Mini App.
const menu = (l: Lang) =>
  Markup.inlineKeyboard([
    ...(process.env.WEBAPP_URL
      ? [[Markup.button.webApp(tr(l, "openApp"), process.env.WEBAPP_URL)]]
      : []),
    [Markup.button.callback(tr(l, "language"), "lang")],
  ]);

export function bloggerBot(token: string) {
  const bot = new Telegraf(token, { telegram: { agent: tgAgent } });
  bot.use(privateOnly, rateLimit);

  bot.start(async (ctx) => {
    const r = await registerBlogger(ctx.from, ctx.payload?.trim() || undefined);
    const l = r.blogger.lang;
    if (r.blogger.status !== "ACTIVE") return ctx.reply(tr(l, "suspended"));
    let msg = r.created ? tr(l, "registered") : tr(l, "welcomeBack");
    if (r.status === "ALREADY") msg = tr(l, "alreadyAssigned");
    if (r.status === "BADLINK") msg += "\n" + tr(l, "badLink");
    ctx.reply(msg, menu(l));
  });

  bot.action("lang", async (ctx) => {
    await ctx.answerCbQuery();
    const b = await db.blogger.findUnique({
      where: { telegramId: BigInt(ctx.from.id) },
    });
    if (!b) return;
    ctx.reply(
      tr(b.lang, "chooseLang"),
      Markup.inlineKeyboard([
        [
          Markup.button.callback("English", "setlang:EN"),
          Markup.button.callback("हिंदी", "setlang:HI"),
        ],
      ]),
    );
  });
  bot.action(/^setlang:(EN|HI)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const b = await db.blogger.findUnique({
      where: { telegramId: BigInt(ctx.from.id) },
    });
    if (!b) return;
    const l = ctx.match[1] as Lang;
    await setLang({ bloggerId: b.id }, l);
    ctx.reply(tr(l, "langSet"), menu(l));
  });

  // A blogger can also paste a video link in the chat to submit it (same rules as the app: Mon-Fri, linked account, no duplicates)
  bot.on("text", async (ctx) => {
    const { blogger } = await registerBlogger(ctx.from);
    const l = blogger.lang;
    if (blogger.status !== "ACTIVE") return ctx.reply(tr(l, "suspended"));
    const m = ctx.message.text.match(/https?:\/\/\S+/i);
    if (!m) return ctx.reply(tr(l, "pasteLink"), menu(l));
    const platform = detectPlatform(m[0]);
    if (!platform) return ctx.reply("❌ " + tr(l, "e_badUrl"));
    const r = await submitVideo(blogger.id, platform, m[0]);
    if ("error" in r) return ctx.reply("❌ " + tr(l, r.error));
    ctx.reply(
      "✅ " + tr(l, r.unverified ? "unverifiedNote" : "submitted"),
      menu(l),
    );
  });

  bot.on("message", async (ctx) => {
    // anything else -> point to the app
    const b = await db.blogger.findUnique({
      where: { telegramId: BigInt(ctx.from.id) },
    });
    ctx.reply(tr(b?.lang ?? "EN", "useApp"), menu(b?.lang ?? "EN"));
  });

  bot.catch((e) => console.error("blogger bot error", e));
  return bot;
}
