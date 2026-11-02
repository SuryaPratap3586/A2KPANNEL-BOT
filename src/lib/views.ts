import { db } from "./db";
<<<<<<< HEAD
import { FetchError, getVideoInfo } from "./providers";
import { istDay } from "./week";
=======
import { getVideoInfo } from "./providers";
import { istDay, weekEnd } from "./week";
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)

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

<<<<<<< HEAD
<<<<<<< HEAD
/** One fetch of an approved video. Fetched numbers are ACTUAL views only: they never create earnings.
 *  - Before the 168 hours end: saves the live numbers; the first successful fetch is the STARTING views (baseViews).
 *  - After the 168 hours end (final fetch): saves the final live views (gained = final - starting is shown to the admin) and freezes the video.
 *  Money: the admin enters the payable views after the 168 hours (setViews); earnings are calculated only from those. */
=======
/** Fetch live views / likes / comments of one approved video. Payable views follow live views unless the admin edited them. */
>>>>>>> parent of f2c3802 (Fetch views only at approval and after 168 hours; auto earnings on gain)
=======
/** One fetch of an approved video.
 *  - Before the 168 hours end: saves the live numbers; the first successful fetch is the STARTING views (baseViews). No money is calculated.
 *  - After the 168 hours end (final fetch): gained views = final views - starting views; earnings are calculated on them and the video is frozen.
 *    If the admin already typed the views, the typed number is kept. Afterwards the admin can still correct the views manually.
 *  Set PAY_ONLY_ADJUSTED="true" to never calculate earnings automatically (admin types every number). */
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
export async function refreshVideo(
  videoId: string,
  source: "AUTO" | "FETCH",
  actorId?: string,
): Promise<FetchResult> {
  const v = await db.video.findUnique({ where: { id: videoId } });
  if (!v || v.status !== "APPROVED") return "notapproved";
  if (v.frozen) return "closed";
<<<<<<< HEAD
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
  // INITIAL views can only be taken while the video is tracking (never at the end: that would make the difference 0)
  const takeBase = v.baseViews === null && !final;
=======
  const info = await getVideoInfo(v.platform, v.url).catch(() => null);
  if (!info || info.views === undefined) return "nodata";
<<<<<<< HEAD
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
=======
  // The first fetch after approval is the starting point: only the views that come AFTER it (inside the 7 days) are counted.
  const base = v.baseViews ?? info.views;
>>>>>>> parent of f2c3802 (Fetch views only at approval and after 168 hours; auto earnings on gain)
  await db.video.update({
    where: { id: videoId },
    data: {
      liveViews: views,
      likes: info.likes ?? v.likes,
      comments: info.comments ?? v.comments,
<<<<<<< HEAD
<<<<<<< HEAD
      lastFetchedAt: now,
      fetchStatus: "OK",
      fetchError: null,
      fetchTriedAt: now,
      ...(takeBase ? { baseViews: views, baseAt: now, baseManual: false } : {}),
      // 7-DAY views: the first successful fetch after the 168 hours; then fetching stops
      ...(final ? { finalViews: views, finalAt: now, finalManual: false, frozen: true } : {}),
    },
  });
<<<<<<< HEAD
=======
      lastFetchedAt: new Date(),
    },
  });
  // Default: money is calculated ONLY on the views the admin adjusts and saves. Set PAY_ONLY_ADJUSTED="false" to let payable views follow the fetched views automatically.
  if (process.env.PAY_ONLY_ADJUSTED === "false" && !v.viewsEdited)
    await applyViews(videoId, info.views, source, actorId);
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
=======
  let r: FetchResult = "ok";
  if (final) {
    if (v.baseViews === null) r = "nobase";
    else {
      if (!v.viewsEdited && process.env.PAY_ONLY_ADJUSTED !== "true")
        await applyViews(videoId, Math.max(0, info.views - v.baseViews), source, actorId); // views gained in the 168 hours
      r = "final";
    }
  }
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
  await recordStat(videoId);
  return r;
}

<<<<<<< HEAD
<<<<<<< HEAD
const HOUR = 3600_000;

/** Run EVERY HOUR. Each approved video is fetched only twice:
 *  1. STARTING views right after approval (done by the Approve button; if that failed, retried here during the first 6 hours).
 *  2. FINAL views once its own 168 hours are over (the first hourly run after the end). Then earnings are calculated and the video is frozen.
 *  If the final fetch keeps failing for 24 hours the video is frozen anyway and the admin types the views.
 *  Works inside a time budget so serverless hosts do not time out; call again to continue. */
=======
/** Run every night ~23:59 IST (also fine to run more often).
 *  - Each approved video is tracked until Saturday 23:59 IST of its submission week, then frozen.
=======
/** Run every night ~23:59 IST (also fine to run more often).
 *  - Each approved video is tracked for ITS OWN 7 days (day 1 = the day it was APPROVED, day 7 ends 23:59 IST), then frozen.
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
 *  - Last 15 minutes before that = final fetch. Videos approved after the week ended get one catch-up fetch.
 *  - Works inside a time budget so serverless hosts do not time out; call again to continue. */
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
=======
      lastFetchedAt: new Date(),
      ...(v.baseViews === null
        ? { baseViews: info.views, baseAt: new Date() }
        : {}),
    },
  });
  // Default: money is calculated ONLY on the views the admin adjusts and saves. Set PAY_ONLY_ADJUSTED="false" to let payable views follow the fetched views automatically.
  if (process.env.PAY_ONLY_ADJUSTED === "false" && !v.viewsEdited)
    await applyViews(videoId, Math.max(0, info.views - base), source, actorId);
  await recordStat(videoId);
  return "ok";
}

/** Run EVERY HOUR (each video ends at its own time, so a nightly run is not enough).
 *  - Each approved video is tracked for ITS OWN 168 hours from the approval timestamp, then frozen.
 *  - The last hour before the end = final fetch (an hourly cron always hits it). A missed end gets one catch-up fetch.
 *  - Works inside a time budget so serverless hosts do not time out; call again to continue. */
>>>>>>> parent of f2c3802 (Fetch views only at approval and after 168 hours; auto earnings on gain)
export async function fetchAll(actorId?: string, budgetMs = 45_000) {
  const t0 = Date.now(),
    now = new Date();
  const vids = await db.video.findMany({
<<<<<<< HEAD
<<<<<<< HEAD
    where: {
      status: "APPROVED",
      frozen: false,
      OR: [
        { trackEndsAt: { lte: now } }, // due for the final fetch
        { baseViews: null, reviewedAt: { gte: new Date(now.getTime() - 6 * HOUR) } }, // starting views still missing
      ],
    },
    orderBy: { trackEndsAt: "asc" },
    select: { id: true, trackEndsAt: true },
=======
    where: { status: "APPROVED", frozen: false },
    orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
    select: { id: true, weekStart: true, lastFetchedAt: true },
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
=======
    where: { status: "APPROVED", frozen: false },
    orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
    select: { id: true, trackEndsAt: true, lastFetchedAt: true },
>>>>>>> parent of f2c3802 (Fetch views only at approval and after 168 hours; auto earnings on gain)
  });
  let tried = 0,
    updated = 0,
    remaining = 0;
  for (const v of vids) {
    if (Date.now() - t0 > budgetMs) {
      remaining++;
      continue;
    }
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
    const end = weekEnd(v.weekStart),
=======
    const end = v.trackEndsAt,
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
      finalFrom = new Date(end.getTime() - 15 * 60_000);
=======
    const end = v.trackEndsAt,
      finalFrom = new Date(end.getTime() - 60 * 60_000);
>>>>>>> parent of f2c3802 (Fetch views only at approval and after 168 hours; auto earnings on gain)
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
<<<<<<< HEAD
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
=======
>>>>>>> parent of f2c3802 (Fetch views only at approval and after 168 hours; auto earnings on gain)
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
