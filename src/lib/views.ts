import { db } from "./db";
import { FetchError, getVideoInfo } from "./providers";
import { ARCHIVE_AFTER_MS, istDay } from "./week";

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
    if (!v || v.status !== "APPROVED") return;
    if (newViews === v.views) {
      // same number typed (e.g. 0 = pay nothing): no money changes, but it now counts as entered by the admin
      if (source === "MANUAL" && !keepEdited && !v.viewsEdited)
        await tx.video.update({ where: { id: v.id }, data: { viewsEdited: true } });
      return;
    }
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
    // only if nobody changed the views in the meantime (two saves at once would otherwise both add the same difference)
    const u = await tx.video.updateMany({
      where: { id: v.id, views: v.views },
      data: {
        views: newViews,
        earnings: { increment: earned },
        ...(source === "MANUAL" && !keepEdited ? { viewsEdited: true } : {}),
      },
    });
    if (u.count !== 1)
      throw new Error("The views of this video were changed at the same moment. Reload and try again.");
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
  await applyViews(
    videoId,
    Math.max(0, v.liveViews - (v.baseViews ?? v.liveViews)),
    "MANUAL",
    actorId,
    true,
  ); // views gained since approval
  await recordStat(videoId);
  return true;
}

export type FetchResult =
  | "ok" // fetched during tracking (starting views, or a live check that does not touch money)
  | "final" // final fetch after the 168 hours: gained views and earnings saved, video frozen
  | "nobase" // final fetch done, but the starting views were never fetched: enter the views manually
  | "closed"
  | "nodata"
  | "notapproved";

/** One fetch of an approved video. Fetched numbers are ACTUAL views only: they never create earnings.
 *  - Before the 168 hours end: saves the live numbers; the first successful fetch is the STARTING views (baseViews).
 *  - After the 168 hours end (final fetch): saves the final live views (gained = final - starting is shown to the admin) and freezes the video.
 *  Money: the admin enters the payable views after the 168 hours (setViews); earnings are calculated only from those. */
export async function refreshVideo(
  videoId: string,
  source: "AUTO" | "FETCH",
  actorId?: string,
): Promise<FetchResult> {
  const v = await db.video.findUnique({ where: { id: videoId } });
  if (!v || v.status !== "APPROVED") return "notapproved";
  if (v.frozen) return "closed";
  const now = new Date();
  let info;
  try {
    info = await getVideoInfo(v.platform, v.url);
  } catch (e) {
    // the reason is shown on the Videos page (Fetch status)
    const reason = e instanceof FetchError ? e.message : "unexpected error while fetching";
    await db.video.update({
      where: { id: videoId },
      data: { fetchStatus: "FAILED", fetchError: reason.slice(0, 300), fetchTriedAt: now },
    });
    return "nodata";
  }
  const views = info.views!;
  const final = v.trackEndsAt <= now;
  await db.video.update({
    where: { id: videoId },
    data: {
      liveViews: views,
      likes: info.likes ?? v.likes,
      comments: info.comments ?? v.comments,
      lastFetchedAt: now,
      fetchStatus: "OK",
      fetchError: null,
      fetchTriedAt: now,
    },
  });
  // INITIAL views can only be taken while the video is tracking (never at the end: that would make the difference 0).
  // Both writes are conditional, so the Approve button and the cron running at the same moment save them only once.
  if (!final)
    await db.video.updateMany({
      where: { id: videoId, baseViews: null },
      data: { baseViews: views, baseAt: now, baseManual: false },
    });
  else
    // 7-DAY views: the first successful fetch after the 168 hours; then fetching stops
    await db.video.updateMany({
      where: { id: videoId, frozen: false },
      data: { finalViews: views, finalAt: now, finalManual: false, frozen: true },
    });
  await recordStat(videoId);
  return !final ? "ok" : v.baseViews === null ? "nobase" : "final";
}

const HOUR = 3600_000;

/** Run EVERY HOUR. Each approved video is fetched only twice:
 *  1. STARTING views right after approval (done by the Approve button; if that failed, retried here during the first 6 hours).
 *  2. FINAL views once its own 168 hours are over (the first hourly run after the end). Then earnings are calculated and the video is frozen.
 *  If the final fetch keeps failing for 24 hours the video is frozen anyway and the admin types the views.
 *  Works inside a time budget so serverless hosts do not time out; call again to continue. */
export async function fetchAll(actorId?: string, budgetMs = 45_000) {
  const t0 = Date.now(),
    now = new Date();
  const vids = await db.video.findMany({
    where: {
      status: "APPROVED",
      frozen: false,
      deletedAt: null,
      OR: [
        { trackEndsAt: { lte: now } }, // due for the final fetch
        { baseViews: null, reviewedAt: { gte: new Date(now.getTime() - 6 * HOUR) } }, // starting views still missing
      ],
    },
    orderBy: { trackEndsAt: "asc" },
    select: { id: true, trackEndsAt: true },
  });
  let tried = 0,
    updated = 0,
    remaining = 0;
  for (const v of vids) {
    if (Date.now() - t0 > budgetMs) {
      remaining++;
      continue;
    }
    tried++;
    const r = await refreshVideo(v.id, actorId ? "FETCH" : "AUTO", actorId);
    if (r !== "nodata" && r !== "notapproved") updated++;
    else if (now.getTime() > v.trackEndsAt.getTime() + 24 * HOUR)
      await db.video.update({ where: { id: v.id }, data: { frozen: true } }); // final fetch impossible: admin types the views
  }
  return { tried, updated, remaining };
}

/** Videos in the Archive (not deleted): archive date saved by the cron, or completed more than 3 days ago. */
export const archivedWhere = (now = new Date()) => ({
  status: "APPROVED" as const,
  deletedAt: null,
  OR: [
    { archivedAt: { not: null } },
    { trackEndsAt: { lte: new Date(now.getTime() - ARCHIVE_AFTER_MS) } },
  ],
});

/** Completed videos stay on the Completed tab for 3 more days, then move to the Archive. Nothing is deleted:
 *  dates, fetched views, payable views and earnings are kept until an admin deletes the video from the Archive. */
export async function archiveCompleted(now = new Date()) {
  const r = await db.video.updateMany({
    where: {
      status: "APPROVED",
      archivedAt: null,
      deletedAt: null,
      trackEndsAt: { lte: new Date(now.getTime() - ARCHIVE_AFTER_MS) },
    },
    data: { archivedAt: now },
  });
  return r.count;
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
