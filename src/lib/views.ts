import { db } from "./db";
import { getVideoInfo } from "./providers";
import { istDay, weekEnd } from "./week";

/** Adjusted (payable) views drive earnings: earned = (new - old views) / 1,000,000 x CURRENT Rs-per-million rate (rate snapshot kept per row).
 *  AUTO (cron) / FETCH (admin pressed fetch) never go down. MANUAL (admin typed) can also correct downwards and marks the video as "edited",
 *  so later fetches only update the live numbers and not the payable views. */
export async function applyViews(
  videoId: string,
  newViews: number,
  source: "AUTO" | "FETCH" | "MANUAL",
  actorId?: string,
  keepEdited = false,
) {
  await db.$transaction(async (tx) => {
    const v = await tx.video.findUnique({
      where: { id: videoId },
      include: { blogger: { include: { agent: { include: { plan: true } } } } },
    });
    if (!v || v.status !== "APPROVED" || newViews === v.views) return;
    if (source !== "MANUAL" && newViews < v.views) return;
    const platformRate = Number(
      (await tx.rate.findUnique({ where: { platform: v.platform } }))
        ?.perMillion ?? 800,
    );
    const rate = Number(
      v.blogger.agent?.plan?.bloggerPerMillion ?? platformRate,
    ); // the agent's plan (D / S) decides the blogger rate; no plan = platform rate
    const delta = newViews - v.views;
    const earned = Math.round((delta / 1_000_000) * rate * 100) / 100;
    await tx.video.update({
      where: { id: v.id },
      data: {
        views: newViews,
        earnings: { increment: earned },
        ...(source === "MANUAL" && !keepEdited ? { viewsEdited: true } : {}),
      },
    });
    await tx.viewHistory.create({
      data: {
        videoId: v.id,
        views: newViews,
        rate,
        earned,
        source,
        delta,
        actorId,
      },
    });
  });
}

/** Saves today's (IST) numbers for the 7-day day-wise table. */
export async function recordStat(videoId: string) {
  const v = await db.video.findUnique({ where: { id: videoId } });
  if (!v) return;
  const day = istDay();
  const d = {
    liveViews: v.liveViews,
    payViews: v.views,
    likes: v.likes,
    comments: v.comments,
  };
  await db.videoStat.upsert({
    where: { videoId_day: { videoId, day } },
    update: d,
    create: { videoId, day, ...d },
  });
}

/** Admin: stop using the typed number and follow the live (fetched) views again. */
export async function resetToLive(videoId: string, actorId?: string) {
  const v = await db.video.findUnique({ where: { id: videoId } });
  if (!v || v.status !== "APPROVED") return false;
  await db.video.update({
    where: { id: videoId },
    data: { viewsEdited: false },
  });
  await applyViews(videoId, v.liveViews, "MANUAL", actorId, true);
  await recordStat(videoId);
  return true;
}

export type FetchResult = "ok" | "closed" | "nodata" | "notapproved";

/** Fetch live views / likes / comments of one approved video. Payable views follow live views unless the admin edited them. */
export async function refreshVideo(
  videoId: string,
  source: "AUTO" | "FETCH",
  actorId?: string,
): Promise<FetchResult> {
  const v = await db.video.findUnique({ where: { id: videoId } });
  if (!v || v.status !== "APPROVED") return "notapproved";
  if (v.frozen) return "closed";
  const info = await getVideoInfo(v.platform, v.url).catch(() => null);
  if (!info || info.views === undefined) return "nodata";
  await db.video.update({
    where: { id: videoId },
    data: {
      liveViews: info.views,
      likes: info.likes ?? v.likes,
      comments: info.comments ?? v.comments,
      lastFetchedAt: new Date(),
    },
  });
  // Default: money is calculated ONLY on the views the admin adjusts and saves. Set PAY_ONLY_ADJUSTED="false" to let payable views follow the fetched views automatically.
  if (process.env.PAY_ONLY_ADJUSTED === "false" && !v.viewsEdited)
    await applyViews(videoId, info.views, source, actorId);
  await recordStat(videoId);
  return "ok";
}

/** Run every night ~23:59 IST (also fine to run more often).
 *  - Each approved video is tracked until Saturday 23:59 IST of its submission week, then frozen.
 *  - Last 15 minutes before that = final fetch. Videos approved after the week ended get one catch-up fetch.
 *  - Works inside a time budget so serverless hosts do not time out; call again to continue. */
export async function fetchAll(actorId?: string, budgetMs = 45_000) {
  const t0 = Date.now(),
    now = new Date();
  const vids = await db.video.findMany({
    where: { status: "APPROVED", frozen: false },
    orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
    select: { id: true, weekStart: true, lastFetchedAt: true },
  });
  let tried = 0,
    updated = 0,
    remaining = 0;
  for (const v of vids) {
    if (Date.now() - t0 > budgetMs) {
      remaining++;
      continue;
    }
    const end = weekEnd(v.weekStart),
      finalFrom = new Date(end.getTime() - 15 * 60_000);
    const inFinal = now >= finalFrom;
    if (inFinal && v.lastFetchedAt && v.lastFetchedAt >= finalFrom) {
      await db.video.update({ where: { id: v.id }, data: { frozen: true } });
      continue;
    }
    if (
      !inFinal &&
      !actorId &&
      v.lastFetchedAt &&
      now.getTime() - v.lastFetchedAt.getTime() < 6 * 3600_000
    )
      continue; // already fetched today
    tried++;
    const r = await refreshVideo(v.id, actorId ? "FETCH" : "AUTO", actorId);
    if (r === "ok") {
      updated++;
      if (inFinal)
        await db.video.update({ where: { id: v.id }, data: { frozen: true } });
    } else if (now.getTime() > end.getTime() + 24 * 3600_000)
      await db.video.update({ where: { id: v.id }, data: { frozen: true } }); // give up after a day
  }
  return { tried, updated, remaining };
}

/** Deletes day-wise stats and repost records older than 14 days, and audit logs older than 3 days.
 *  Videos and earnings are kept, so balances never change. */
export async function cleanupOld() {
  const s = await db.videoStat.deleteMany({
    where: { day: { lt: new Date(istDay().getTime() - 14 * 86_400_000) } },
  });
  const r = await db.repost.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 14 * 86_400_000) } },
  });
  const a = await db.auditLog.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 3 * 86_400_000) } },
  });
  return { stats: s.count, reposts: r.count, auditLogs: a.count };
}
