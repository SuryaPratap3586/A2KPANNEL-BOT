import { NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { db } from "@/lib/db";
import { RateLimiter, verifyWebAppInitData } from "@/lib/security";
import * as svc from "@/lib/services";

const limiter = new RateLimiter(60, 60_000);
const P = z.nativeEnum(Platform),
  url = z.string().trim().min(5).max(500);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("me") }),
  z.object({ action: z.literal("setLang"), lang: z.enum(["EN", "HI"]) }),
  z.object({
    action: z.literal("setPay"),
    details: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal("withdraw"),
    amount: z.coerce.number().positive().max(10_000_000),
  }),
  z.object({ action: z.literal("addAccount"), platform: P, url }),
  z.object({
    action: z.literal("submitVideo"),
    accountId: z.string().cuid().optional(),
    platform: P.optional(),
    url,
  }),
  z.object({ action: z.literal("newLink") }),
]);

/** One endpoint for the whole Mini App. Every call re-verifies Telegram's signed initData (HMAC) - no cookies, no trust in the client. */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const initData =
    typeof json?.initData === "string" && json.initData.length < 4096
      ? json.initData
      : "";
  const asBlogger = verifyWebAppInitData(
    initData,
    process.env.BLOGGER_BOT_TOKEN ?? "",
    86400,
  );
  const asAgent = asBlogger
    ? null
    : verifyWebAppInitData(initData, process.env.AGENT_BOT_TOKEN ?? "", 86400);
  const tg = asBlogger ?? asAgent;
  if (!tg) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!limiter.allow(String(tg.id)))
    return NextResponse.json({ error: "slow down" }, { status: 429 });
  const body = Body.safeParse(json);
  if (!body.success)
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  const a = body.data;

  let who: { bloggerId?: string; agentId?: string };
  if (asBlogger) {
    const { blogger } = await svc.registerBlogger(tg); // opening the app also registers
    if (blogger.status !== "ACTIVE")
      return NextResponse.json({ error: "suspended" }, { status: 403 });
    who = { bloggerId: blogger.id };
  } else {
    const ag = await db.agent.findUnique({
      where: { telegramId: BigInt(tg.id) },
    });
    if (!ag || ag.status !== "ACTIVE")
      return NextResponse.json({ error: "not logged in" }, { status: 403 });
    who = { agentId: ag.id };
  }

  let extra: Record<string, unknown> = {};
  let res: { ok: true } | { error: string } = { ok: true };
  switch (a.action) {
    case "setLang":
      await svc.setLang(who, a.lang);
      break;
    case "setPay":
      await svc.setPayDetails(who, a.details);
      break;
    case "withdraw":
      res = await svc.requestWithdrawal(who, a.amount);
      break;
    case "addAccount":
      if (who.bloggerId)
        res = await svc.addAccount(who.bloggerId, a.platform, a.url);
      break;
    case "submitVideo":
      if (who.bloggerId)
        res = a.accountId
          ? await svc.submitVideoForAccount(who.bloggerId, a.accountId, a.url)
          : a.platform
            ? await svc.submitVideo(who.bloggerId, a.platform, a.url)
            : { error: "e_badUrl" };
      break;
    case "newLink":
      if (who.agentId) extra = { link: await svc.createReferral(who.agentId) };
      break;
  }
  if ("error" in res)
    return NextResponse.json({ error: res.error }, { status: 400 });
  const data = who.bloggerId
    ? await svc.bloggerData(who.bloggerId)
    : await svc.agentData(who.agentId!);
  return NextResponse.json({ data, ...extra });
}
