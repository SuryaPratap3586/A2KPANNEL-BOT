// Business logic shared by the Telegram bots and the Web App API.
import { Blogger, Platform, SocialAccount } from "@prisma/client";
import { db } from "./db";
import { agentBalance, bloggerBalance } from "./balance";
import { MIN_WITHDRAW, getAgentBonus } from "./settings";
import { ownerHint, normalizeVideoUrl, parseAccount } from "./platforms";
import { getVideoInfo } from "./providers";
import { submissionOpen, weekStartIST } from "./week";
import { randomToken } from "./security";
import { creditEligible } from "./commission";

export type ErrKey =
  | "e_badUrl"
  | "e_needAccount"
  | "e_dup"
  | "e_dupAccount"
  | "e_accountTaken"
  | "e_needPay"
  | "e_minAmt"
  | "e_low"
  | "e_failed"
  | "e_closed"
  | "e_notLinked"
  | "e_cantVerify";
type Err = { error: ErrKey };
const num = (d: unknown) => Number(d ?? 0);

/** Looks up an agent link (unused, agent active). */
async function findLink(code?: string) {
  if (!code || !/^[A-Za-z0-9_-]{6,40}$/.test(code)) return null;
  const link = await db.referralLink.findUnique({
    where: { code },
    include: { agent: { include: { plan: true } } },
  });
  return link && !link.usedAt && link.agent.status === "ACTIVE" ? link : null;
}

/** /start is enough to register. The agent link assigns the agent automatically (also for a blogger who joined earlier without a link)
 *  and sets the agent bonus from the agent's plan. Only 3 database round trips, so the bot answers fast. */
export async function registerBlogger(
  tg: { id: number; first_name: string; username?: string },
  code?: string,
): Promise<{
  blogger: Blogger;
  created: boolean;
  status: "OK" | "ALREADY" | "BADLINK";
  agentName?: string;
}> {
  const tid = BigInt(tg.id);
  const [existing, link] = await Promise.all([
    db.blogger.findUnique({ where: { telegramId: tid } }),
    findLink(code),
  ]);
  const bonusOf = async (l: NonNullable<typeof link>) =>
    l.agent.plan ? Number(l.agent.plan.agentBonus) : await getAgentBonus();
  const useLink = async (l: NonNullable<typeof link>) =>
    (
      await db.referralLink.updateMany({
        where: { id: l.id, usedAt: null },
        data: { usedAt: new Date() },
      })
    ).count === 1;

  if (existing) {
    if (!code) return { blogger: existing, created: false, status: "OK" };
    if (existing.agentId)
      return { blogger: existing, created: false, status: "ALREADY" }; // already has an agent
    if (!link || !(await useLink(link)))
      return { blogger: existing, created: false, status: "BADLINK" };
    const blogger = await db.blogger.update({
      where: { id: existing.id },
      data: { agentId: link.agentId, agentBonus: await bonusOf(link) },
    });
    await creditEligible({ bloggerId: blogger.id });
    return {
      blogger,
      created: false,
      status: "OK",
      agentName: link.agent.name,
    };
  }

  let agentId: string | null = null,
    bonus = 0,
    agentName: string | undefined;
  if (link && (await useLink(link))) {
    agentId = link.agentId;
    agentName = link.agent.name;
    bonus = await bonusOf(link);
  }
  try {
    const blogger = await db.blogger.create({
      data: {
        telegramId: tid,
        name: tg.first_name.slice(0, 60),
        username: tg.username,
        agentId,
        agentBonus: bonus,
      },
    });
    return {
      blogger,
      created: true,
      status: code && !agentId ? "BADLINK" : "OK",
      agentName,
    };
  } catch {
    if (agentId && link)
      await db.referralLink
        .update({ where: { id: link.id }, data: { usedAt: null } })
        .catch(() => {}); // parallel /start: give the link back
    const b = await db.blogger.findUnique({ where: { telegramId: tid } });
    if (b) return { blogger: b, created: false, status: "OK" };
    throw new Error("register failed");
  }
}

export async function createReferral(agentId: string, bonusKnown?: number) {
  const code = randomToken(9);
  await db.referralLink.create({ data: { code, agentId } });
  let bonus = bonusKnown; // the bot already knows the agent's plan: saves a database round trip
  if (bonus === undefined) {
    const ag = await db.agent.findUnique({
      where: { id: agentId },
      include: { plan: true },
    });
    bonus = ag?.plan ? Number(ag.plan.agentBonus) : await getAgentBonus();
  }
  return {
    url: `https://t.me/${process.env.BLOGGER_BOT_USERNAME}?start=${code}`,
    bonus,
  };
}

export async function addAccount(
  bloggerId: string,
  platform: Platform,
  raw: string,
): Promise<{ ok: true } | Err> {
  const a = parseAccount(platform, raw);
  if (!a) return { error: "e_badUrl" };
  if (a.ref) {
    // one account can belong to one blogger only
    const taken = await db.socialAccount.findFirst({
      where: {
        platform,
        ref: a.ref,
        bloggerId: { not: bloggerId },
        status: { not: "REJECTED" },
      },
    });
    if (taken) return { error: "e_accountTaken" };
  }
  const existing = await db.socialAccount.findFirst({
    where: { bloggerId, platform, url: a.url },
  });
  if (existing) {
    if (existing.status !== "REJECTED") return { error: "e_dupAccount" };
    await db.socialAccount.update({
      where: { id: existing.id },
      data: { status: "PENDING", rejectReason: null, ref: a.ref },
    }); // applying again after a rejection
    return { ok: true };
  }
  try {
    await db.socialAccount.create({
      data: { bloggerId, platform, url: a.url, ref: a.ref },
    });
    return { ok: true };
  } catch {
    return { error: "e_dupAccount" };
  }
}

/** Rules: Monday-Friday only; link must be new (else it is saved as a repost); the video must belong to one of the blogger's approved accounts
 *  (checked through YouTube API / Instagram+Facebook provider, or from the link itself). If the owner cannot be read, the video is accepted as "unverified"
 *  for admin to check, unless STRICT_OWNER_CHECK="true". */
export async function submitVideo(
  bloggerId: string,
  platform: Platform,
  raw: string,
  only?: SocialAccount | null,
): Promise<{ ok: true; unverified: boolean } | Err> {
  if (!submissionOpen()) return { error: "e_closed" };
  const url = normalizeVideoUrl(platform, raw);
  if (!url) return { error: "e_badUrl" };

  const dup = await db.video.findUnique({ where: { url } });
  if (dup) {
    await db.repost.create({ data: { bloggerId, url, originalId: dup.id } });
    return { error: "e_dup" };
  }

  let accountId: string | null = null,
    verified = false;
  if (platform !== "OTHER") {
    const accounts = only
      ? [only]
      : await db.socialAccount.findMany({
          where: { bloggerId, platform, status: "APPROVED" },
        }); // `only` = the account the blogger picked in the app
    if (!accounts.length && process.env.REQUIRE_ACCOUNT_APPROVAL !== "false")
      return { error: "e_needAccount" };
    if (accounts.length) {
      const owners = new Set<string>();
      const hint = ownerHint(platform, raw);
      if (hint) owners.add(hint);
      const info = await getVideoInfo(platform, url).catch(() => null);
      info?.owners.forEach((o) => owners.add(o));
      if (owners.size) {
        const match = accounts.find(
          (a) => a.ref && owners.has(a.ref.toLowerCase()),
        );
        if (!match) return { error: "e_notLinked" }; // video belongs to some other account
        accountId = match.id;
        verified = true;
      } else if (process.env.STRICT_OWNER_CHECK === "true")
        return { error: "e_cantVerify" };
    }
  }
  try {
    await db.video.create({
      data: {
        bloggerId,
        platform,
        url,
        accountId,
        ownerVerified: verified,
        weekStart: weekStartIST(),
      },
    });
    return { ok: true, unverified: !verified && platform !== "OTHER" };
  } catch (e: any) {
    if (e?.code === "P2002") {
      // same link submitted at the same moment
      const d = await db.video.findUnique({ where: { url } });
      await db.repost
        .create({ data: { bloggerId, url, originalId: d?.id } })
        .catch(() => {});
      return { error: "e_dup" };
    }
    return { error: "e_failed" };
  }
}

/** Blogger picked one of his approved accounts (platform + username) and pasted the link: the video must belong to THAT account. */
export async function submitVideoForAccount(
  bloggerId: string,
  accountId: string,
  raw: string,
): Promise<{ ok: true; unverified: boolean } | Err> {
  const acc = await db.socialAccount.findFirst({
    where: { id: accountId, bloggerId, status: "APPROVED" },
  });
  if (!acc) return { error: "e_needAccount" };
  return submitVideo(bloggerId, acc.platform, raw, acc);
}

export async function setPayDetails(
  who: { bloggerId?: string; agentId?: string },
  details: string,
) {
  const d = details.trim().slice(0, 300);
  if (who.bloggerId)
    await db.blogger.update({
      where: { id: who.bloggerId },
      data: { paymentDetails: d },
    });
  else if (who.agentId)
    await db.agent.update({
      where: { id: who.agentId },
      data: { bankDetails: d },
    });
}

export async function setLang(
  who: { bloggerId?: string; agentId?: string },
  lang: "EN" | "HI",
) {
  if (who.bloggerId)
    await db.blogger.update({ where: { id: who.bloggerId }, data: { lang } });
  else if (who.agentId)
    await db.agent.update({ where: { id: who.agentId }, data: { lang } });
}

/** Payment request for a blogger or an agent. Serializable => no double spend. Admin then moves it Pending -> In progress -> Complete (or Rejects). */
export async function requestWithdrawal(
  who: { bloggerId?: string; agentId?: string },
  amount: number,
): Promise<{ ok: true } | Err> {
  amount = Math.round(amount * 100) / 100;
  const details = who.bloggerId
    ? (await db.blogger.findUnique({ where: { id: who.bloggerId } }))
        ?.paymentDetails
    : (await db.agent.findUnique({ where: { id: who.agentId! } }))?.bankDetails;
  if (!details) return { error: "e_needPay" };
  if (!isFinite(amount) || amount < MIN_WITHDRAW())
    return { error: "e_minAmt" };
  try {
    await db.$transaction(
      async (tx) => {
        const bal = who.bloggerId
          ? await bloggerBalance(who.bloggerId, tx)
          : await agentBalance(who.agentId!, tx);
        if (bal < amount) throw new Error("low");
        await tx.withdrawal.create({
          data: {
            bloggerId: who.bloggerId,
            agentId: who.agentId,
            amount,
            details,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message === "low" ? "e_low" : "e_failed" };
  }
}

const payRow = (w: any) => ({
  id: w.id,
  amount: num(w.amount),
  status: w.status,
  note: w.note,
  date: w.createdAt.toISOString().slice(0, 10),
});

/** "@username" / "@handle" shown next to the platform. */
const accLabel = (a: { platform: string; ref: string | null; url: string }) =>
  a.ref
    ? a.platform === "INSTAGRAM"
      ? "@" + a.ref
      : a.platform === "YOUTUBE" && !a.ref.startsWith("@")
        ? a.url.replace(/^https?:\/\/(www\.)?/, "")
        : a.ref
    : a.url.replace(/^https?:\/\/(www\.)?/, "");

/** Blogger dashboard data. Only the adjusted views total (paid on) and the video counts are sent: no actual views, earnings, rates or per-reel numbers. */
export async function bloggerData(id: string) {
  const b = await db.blogger.findUniqueOrThrow({
    where: { id },
    include: { agent: true },
  });
  const [accounts, videos, pays, balance, agg, reposts, cnt] =
    await Promise.all([
      db.socialAccount.findMany({
        where: { bloggerId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.video.findMany({
        where: { bloggerId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.withdrawal.findMany({
        where: { bloggerId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      bloggerBalance(id),
      db.video.aggregate({
        where: { bloggerId: id, status: "APPROVED" },
        _sum: { views: true },
      }),
      db.repost.findMany({
        where: { bloggerId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      db.video.groupBy({
        by: ["status"],
        where: { bloggerId: id },
        _count: { _all: true },
      }),
    ]);
  const c = (st: string) => cnt.find((x) => x.status === st)?._count._all ?? 0;
  return {
    role: "blogger" as const,
    name: b.name,
    lang: b.lang,
    agent: b.agent?.name ?? null,
    balance,
    payDetails: b.paymentDetails ?? "",
    views: agg._sum.views ?? 0,
    minWithdraw: MIN_WITHDRAW(),
    submitOpen: submissionOpen(),
    counts: {
      pending: c("PENDING"),
      approved: c("APPROVED"),
      rejected: c("REJECTED"),
    },
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      url: a.url,
      status: a.status,
      label: accLabel(a),
      reason: a.rejectReason,
    })),
    assignedLink: b.assignedLink ?? "",
    videos: videos.map((v) => ({
      id: v.id,
      platform: v.platform,
      url: v.url,
      status: v.status,
      reason: v.rejectReason,
    })),
    reposts: reposts.map((r) => ({
      id: r.id,
      url: r.url,
      date: r.createdAt.toISOString().slice(0, 10),
    })),
    payments: pays.map(payRow),
  };
}

export async function agentData(id: string) {
  await creditEligible({ agentId: id });
  const a = await db.agent.findUniqueOrThrow({
    where: { id },
    include: { plan: true },
  });
  const mine = { blogger: { agentId: id } };
  const [bloggers, videos, pays, balance, bonusAgg] = await Promise.all([
    db.blogger.findMany({
      where: { agentId: id, status: { not: "DELETED" } },
      include: { _count: { select: { videos: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.video.findMany({
      where: mine,
      include: { blogger: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.withdrawal.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    agentBalance(id),
    db.blogger.aggregate({
      where: {
        agentId: id,
        status: { not: "DELETED" },
        bonusCreditedAt: { not: null },
      },
      _sum: { agentBonus: true },
    }),
  ]);
  return {
    role: "agent" as const,
    name: a.name,
    lang: a.lang,
    balance,
    payDetails: a.bankDetails ?? "",
    earnings: num(bonusAgg._sum.agentBonus),
    bonus: a.plan ? Number(a.plan.agentBonus) : await getAgentBonus(),
    minWithdraw: MIN_WITHDRAW(),
    bloggers: bloggers.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      videos: b._count.videos,
      credited: !!b.bonusCreditedAt,
      bonus: b.bonusCreditedAt ? num(b.agentBonus) : 0,
    })),
    videos: videos.map((v) => ({
      id: v.id,
      platform: v.platform,
      url: v.url,
      status: v.status,
      views: v.views,
      blogger: v.blogger.name,
    })),
    payments: pays.map(payRow),
  };
}
