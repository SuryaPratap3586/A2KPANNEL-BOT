import { Telegraf, Markup } from "telegraf";
import { db } from "../src/lib/db";
import { sha256 } from "../src/lib/security";
import { agentBalance } from "../src/lib/balance";
import { createReferral, setLang } from "../src/lib/services";
import { Lang, tr } from "../src/lib/i18n";
import {
  background,
  cached,
  dropCache,
  privateOnly,
  quiet,
  rateLimit,
  safeReply,
  timing,
  state,
  tgAgent,
  WEBAPP_URL,
  withTimeout,
} from "./common";

// Agent bot: My Profile, Add Blogger, Language + Open App (everything else lives in the Mini App).
const menu = (l: Lang) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(tr(l, "profile"), "profile"),
      Markup.button.callback(tr(l, "addBlogger"), "add"),
    ],
    [Markup.button.callback(tr(l, "language"), "lang")],
    ...(WEBAPP_URL
      ? [[Markup.button.webApp(tr(l, "openApp"), WEBAPP_URL)]]
      : []),
  ]);

/** Button handler: the button is answered at once and never blocks the reply (a slow answerCbQuery used to stop the link from being sent);
 *  any error is logged (without secrets) and the user gets a message instead of silence. */
const safe = (fn: (ctx: any) => Promise<unknown>) => async (ctx: any) => {
  quiet(() => ctx.callbackQuery && ctx.answerCbQuery()); // the button stops spinning at once (only buttons can be answered: for a normal message this call throws)
  quiet(() => ctx.sendChatAction("typing")); // "typing..." shows instantly while the work is done
  try {
    await withTimeout(fn(ctx));
  } catch (e: any) {
    console.error(
      "agent bot action failed:",
      e?.description ?? e?.code ?? e?.name ?? "error",
    );
    ctx.reply("⚠️ Something went wrong, please try again.").catch(() => {});
  }
};

export function agentBot(token: string) {
  const bot = new Telegraf(token, { telegram: { agent: tgAgent } });
  bot.use(background, timing, privateOnly, rateLimit, safeReply);
  const me = (id: number) =>
    cached(`agent:${id}`, 30_000, () =>
      db.agent.findFirst({
        where: { telegramId: BigInt(id), status: "ACTIVE" },
        include: { plan: true },
      }),
    ); // 30 s memory: repeated clicks are instant

  bot.start(async (ctx) => {
    ctx.sendChatAction("typing").catch(() => {});
    const a = await me(ctx.from.id);
    if (a) return ctx.reply(tr(a.lang, "agentMenu"), menu(a.lang));
    state.set(ctx.from.id, { step: "token" });
    ctx.reply(tr("EN", "loginPrompt"));
  });

  bot.action(
    "profile",
    safe(async (ctx) => {
      const a = await me(ctx.from.id);
      if (!a) return ctx.reply(tr("EN", "needLogin"));
      const n = await db.blogger.count({
        where: { agentId: a.id, status: { not: "DELETED" } },
      });
      await ctx.reply(
        tr(a.lang, "profileText", {
          name: a.name,
          n,
          bal: (await agentBalance(a.id)).toFixed(2),
          bank: a.bankDetails ?? tr(a.lang, "notSet"),
        }),
        menu(a.lang),
      );
    }),
  );

  bot.action(
    "add",
    safe(async (ctx) => {
      const a = await me(ctx.from.id);
      if (!a) return ctx.reply(tr("EN", "needLogin"));
      const { url, bonus } = await createReferral(
        a.id,
        a.plan ? Number(a.plan.agentBonus) : undefined,
      );
      await ctx.reply(tr(a.lang, "linkText", { url, bonus }), menu(a.lang));
    }),
  );

  bot.action(
    "lang",
    safe(async (ctx) => {
      const a = await me(ctx.from.id);
      if (!a) return ctx.reply(tr("EN", "needLogin"));
      await ctx.reply(
        tr(a.lang, "chooseLang"),
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
      const a = await me(ctx.from.id);
      if (!a) return;
      const l = ctx.match[1] as Lang;
      await setLang({ agentId: a.id }, l);
      dropCache(`agent:${ctx.from.id}`);
      await ctx.reply(tr(l, "langSet"), menu(l));
    }),
  );

  bot.on("text", async (ctx) => {
    try {
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
      dropCache(`agent:${ctx.from.id}`);
      await ctx.reply(tr(a.lang, "loggedIn", { name: a.name }), menu(a.lang));
    } catch (e: any) {
      console.error("agent bot login failed:", e?.code ?? e?.name ?? "error");
      ctx.reply("⚠️ Something went wrong, please try again.").catch(() => {});
    }
  });

  bot.catch((e: any) =>
    console.error("agent bot error:", e?.code ?? e?.name ?? "error"),
  );
  return bot;
}
