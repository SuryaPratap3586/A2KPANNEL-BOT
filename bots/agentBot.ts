import { Telegraf, Markup } from "telegraf";
import { db } from "../src/lib/db";
import { sha256 } from "../src/lib/security";
import { agentBalance } from "../src/lib/balance";
import { createReferral, setLang } from "../src/lib/services";
import { Lang, tr } from "../src/lib/i18n";
import { privateOnly, rateLimit, state, tgAgent } from "./common";

// Agent bot: My Profile, Add Blogger, Language + Open App (everything else lives in the Mini App).
const menu = (l: Lang) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(tr(l, "profile"), "profile"),
      Markup.button.callback(tr(l, "addBlogger"), "add"),
    ],
    [Markup.button.callback(tr(l, "language"), "lang")],
    ...(process.env.WEBAPP_URL
      ? [[Markup.button.webApp(tr(l, "openApp"), process.env.WEBAPP_URL)]]
      : []),
  ]);

export function agentBot(token: string) {
  const bot = new Telegraf(token, { telegram: { agent: tgAgent } });
  bot.use(privateOnly, rateLimit);
  const me = (id: number) =>
    db.agent.findFirst({ where: { telegramId: BigInt(id), status: "ACTIVE" } });

  bot.start(async (ctx) => {
    const a = await me(ctx.from.id);
    if (a) return ctx.reply(tr(a.lang, "agentMenu"), menu(a.lang));
    state.set(ctx.from.id, { step: "token" });
    ctx.reply(tr("EN", "loginPrompt"));
  });

  bot.action("profile", async (ctx) => {
    await ctx.answerCbQuery();
    const a = await me(ctx.from.id);
    if (!a) return ctx.reply(tr("EN", "needLogin"));
    const n = await db.blogger.count({
      where: { agentId: a.id, status: { not: "DELETED" } },
    });
    ctx.reply(
      tr(a.lang, "profileText", {
        name: a.name,
        n,
        bal: (await agentBalance(a.id)).toFixed(2),
        bank: a.bankDetails ?? tr(a.lang, "notSet"),
      }),
      menu(a.lang),
    );
  });

  bot.action("add", async (ctx) => {
    await ctx.answerCbQuery();
    const a = await me(ctx.from.id);
    if (!a) return ctx.reply(tr("EN", "needLogin"));
    const { url, bonus } = await createReferral(a.id);
    ctx.reply(tr(a.lang, "linkText", { url, bonus }), menu(a.lang));
  });

  bot.action("lang", async (ctx) => {
    await ctx.answerCbQuery();
    const a = await me(ctx.from.id);
    if (!a) return ctx.reply(tr("EN", "needLogin"));
    ctx.reply(
      tr(a.lang, "chooseLang"),
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
    const a = await me(ctx.from.id);
    if (!a) return;
    const l = ctx.match[1] as Lang;
    await setLang({ agentId: a.id }, l);
    ctx.reply(tr(l, "langSet"), menu(l));
  });

  bot.on("text", async (ctx) => {
    const s = state.get(ctx.from.id);
    if (!s || s.step !== "token") return;
    ctx.deleteMessage().catch(() => {}); // remove the token from chat history
    const a = await db.agent.findUnique({
      where: { tokenHash: sha256(ctx.message.text.trim()) },
    });
    if (!a || a.status !== "ACTIVE") return ctx.reply(tr("EN", "badToken"));
    if (a.telegramId && a.telegramId !== BigInt(ctx.from.id))
      return ctx.reply(tr("EN", "tokenUsed"));
    await db.agent.update({
      where: { id: a.id },
      data: { telegramId: BigInt(ctx.from.id) },
    });
    state.delete(ctx.from.id);
    ctx.reply(tr(a.lang, "loggedIn", { name: a.name }), menu(a.lang));
  });

  bot.catch((e) => console.error("agent bot error", e));
  return bot;
}
