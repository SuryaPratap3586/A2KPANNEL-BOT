import { db } from "./db";

/** The agent bonus of a blogger is credited only when the blogger has linked an approved account AND has at least this many approved videos. */
export async function minVideos(): Promise<number> {
  const s = await db.setting.findUnique({
    where: { key: "AGENT_BONUS_MIN_VIDEOS" },
  });
  const n = s ? parseInt(s.value, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Credits the agent bonus of every blogger who now qualifies. Safe to call as often as you like. Returns how many bloggers were credited. */
export async function creditEligible(
  opts: { bloggerId?: string; agentId?: string } = {},
): Promise<number> {
  const need = await minVideos();
  const bloggers = await db.blogger.findMany({
    where: {
      agentId: opts.agentId ?? { not: null },
      bonusCreditedAt: null,
      status: { not: "DELETED" },
      ...(opts.bloggerId ? { id: opts.bloggerId } : {}),
    },
    select: { id: true },
    take: 1000,
  });
  if (!bloggers.length) return 0;
  const ids = bloggers.map((b) => b.id);
  const [vids, accs] = await Promise.all([
    db.video.groupBy({
      by: ["bloggerId"],
      where: { bloggerId: { in: ids }, status: "APPROVED" },
      _count: { _all: true },
    }),
    db.socialAccount.groupBy({
      by: ["bloggerId"],
      where: { bloggerId: { in: ids }, status: "APPROVED" },
      _count: { _all: true },
    }),
  ]);
  const needAccount = process.env.REQUIRE_ACCOUNT_APPROVAL !== "false";
  const ok = ids.filter(
    (id) =>
      (vids.find((v) => v.bloggerId === id)?._count._all ?? 0) >= need &&
      (!needAccount || accs.some((a) => a.bloggerId === id)),
  );
  if (!ok.length) return 0;
  await db.blogger.updateMany({
    where: { id: { in: ok }, bonusCreditedAt: null },
    data: { bonusCreditedAt: new Date() },
  });
  return ok.length;
}
