<<<<<<< HEAD
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { pageStaff } from "@/lib/auth";
<<<<<<< HEAD
import { istDateTime, trackState } from "@/lib/week";
=======
import { db } from "@/lib/db";
import { pageStaff } from "@/lib/auth";
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
=======
import { trackDay } from "@/lib/week";
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
import PlanBadge from "../PlanBadge";
<<<<<<< HEAD
import { reviewVideo, fetchAllAction } from "../actions";
import VideoCard from "./VideoCard";
=======
import {
  reviewVideo,
  setViews,
  fetchOneAction,
  fetchAllAction,
  resetToLiveAction,
} from "../actions";
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
export const dynamic = "force-dynamic";
<<<<<<< HEAD

// Every approved video has its OWN 168 hours (from the approval time). While they run, the video is in "Tracking";
// when they are over it moves to "Completed". Views: INITIAL (fetched at approval) and 7-DAY (fetched after the 168 hours),
// difference = 7-day - initial. Payment comes only from the payable views the admin enters on Completed.
const TABS = [
  "PENDING",
  "TRACKING",
  "COMPLETED",
  "REJECTED",
  "REPOSTS",
] as const;
const LABEL: Record<(typeof TABS)[number], string> = {
  PENDING: "Pending",
  TRACKING: "Tracking (7 days running)",
  COMPLETED: "Completed (7 days done)",
  REJECTED: "Rejected",
  REPOSTS: "Reposts",
};
=======
const TABS = ["PENDING", "APPROVED", "REJECTED", "REPOSTS"] as const;
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
const REASONS = [
  "Wrong Logo",
  "Bad Quality",
  "Fake Video",
  "Duplicate Video",
  "Wrong Caption",
  "Wrong Hashtag",
  "Wrong Link",
  "Repost / not own video",
  "Account not linked",
];
const fmt = (n: number) => n.toLocaleString("en-IN");
<<<<<<< HEAD
<<<<<<< HEAD
const STATE: Record<string, [string, string]> = {
  PENDING_APPROVAL: ["Pending Approval", "text-amber-700"],
  TRACKING: ["Tracking in Progress", "text-blue-700"],
  COMPLETED: ["7 Days Completed", "text-green-700"],
  REJECTED: ["Rejected", "text-red-700"],
};
type TimelineV = {
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
  trackEndsAt: Date;
  submittedVia: string;
};
/** Submission, approval and tracking timestamps (IST). Tracking = approval timestamp + exactly 168 hours. */
function Timeline({ v, now }: { v: TimelineV; now: Date }) {
  const [label, tone] = STATE[trackState(v, now)];
  return (
    <div className="text-xs text-slate-500 space-y-0.5 mt-1">
      <div className={"font-semibold " + tone}>{label}</div>
      <div>
        Submitted: {istDateTime(v.createdAt)} (via{" "}
        {v.submittedVia === "BOT" ? "bot" : "app"})
      </div>
      {v.status !== "PENDING" && v.reviewedAt && (
        <div>
          {v.status === "APPROVED" ? "Approved" : "Rejected"}:{" "}
          {istDateTime(v.reviewedAt)}
        </div>
      )}
      {v.status === "APPROVED" && (
        <>
          <div>Tracking start: {istDateTime(v.reviewedAt ?? v.createdAt)}</div>
          <div>Tracking end: {istDateTime(v.trackEndsAt)}</div>
        </>
      )}
    </div>
  );
}
=======
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
=======
const istDate = (d: Date) =>
  new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const istTime = (d: Date) =>
  d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const gained = (v: { liveViews: number; baseViews: number | null }) =>
  Math.max(0, v.liveViews - (v.baseViews ?? v.liveViews)); // views gained since approval
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)

// Visible to every admin: all bloggers' videos, approve/reject with reason, fetch views (auto) or type views (manual).
export default async function Videos({
  searchParams,
}: {
  searchParams: { status?: string; msg?: string };
}) {
  const me = await pageStaff();
  const tab = (TABS as readonly string[]).includes(searchParams.status ?? "")
    ? (searchParams.status as (typeof TABS)[number])
    : "PENDING";
  const isVideoTab = tab !== "REPOSTS";
  const list = isVideoTab
    ? await db.video.findMany({
        where: { status: tab as "PENDING" },
        include: {
          blogger: { include: { agent: { include: { plan: true } } } },
          reviewedBy: true,
        },
        orderBy: { createdAt: tab === "PENDING" ? "asc" : "desc" },
        take: 150,
      })
    : [];
  const reposts = !isVideoTab
    ? await db.repost.findMany({
        include: { blogger: true, original: { include: { blogger: true } } },
        orderBy: { createdAt: "desc" },
        take: 150,
      })
    : [];
  const [counts, repostCount] = await Promise.all([
    db.video.groupBy({ by: ["status"], _count: { _all: true } }),
    db.repost.count(),
  ]);
  const stats =
    tab === "APPROVED" && list.length
      ? await db.videoStat.findMany({
          where: { videoId: { in: list.map((v) => v.id) } },
          orderBy: { day: "asc" },
        })
      : [];
  const n = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const open = (u: string) => (
    <a
      className="underline"
      href={u}
      target="_blank"
      rel="noopener noreferrer nofollow"
    >
      Open ↗
    </a>
  );
  const owner = (v: { ownerVerified: boolean }) =>
    v.ownerVerified ? (
      <span className="text-green-700 text-xs">✓ linked account</span>
    ) : (
      <span className="text-amber-700 text-xs">
        ⚠ owner not verified, check manually
      </span>
    );

  return (
    <>
      <h1 className="text-xl font-semibold">Videos</h1>
      {searchParams.msg && <p className="card text-sm">{searchParams.msg}</p>}
<<<<<<< HEAD
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
=======
      <div className="flex gap-4 text-sm">
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
        {TABS.map((t) => (
          <a
            key={t}
            href={`?status=${t}`}
            className={"underline " + (t === tab ? "font-bold" : "")}
          >
            {t[0] + t.slice(1).toLowerCase()} (
            {t === "REPOSTS" ? repostCount : n(t)})
          </a>
        ))}
      </div>
<<<<<<< HEAD
      {approvedTab && (
        <details className="card text-xs text-slate-600">
          <summary className="cursor-pointer text-sm font-medium">
            How views and payment work
          </summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <b>Initial views</b> are fetched when the video is approved. Its
              168 hours (7 days) start at that moment.
            </li>
            <li>
              <b>7-day views</b> are fetched by the hourly cron after the 168
              hours. <b>View difference</b> = 7-day views − initial views.
            </li>
            <li>
              If a fetch fails, the reason is shown under <b>Fetch status</b>{" "}
              and you can type the views under <b>Enter views manually</b>.
            </li>
            <li>
              Fetched views never create a payment. On the Completed tab you
              enter the <b>payable views</b>; the payment is calculated only
              from them.
            </li>
          </ul>
        </details>
      )}
      {tab === "TRACKING" && (
<<<<<<< HEAD
        <form action={fetchAllAction} className="flex flex-wrap items-center gap-2">
          <Btn className="btn">Run due fetches now</Btn>
=======
        <form action={fetchAllAction}>
<<<<<<< HEAD
          <button className="btn">
            Fetch views for all running videos (auto)
          </button>{" "}
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
          <span className="text-xs text-slate-500">
            Fetches missing initial views and the 7-day views of videos whose
            168 hours are over (the hourly cron does the same).
          </span>
        </form>
      )}
      {tab === "PENDING" && (
        <p className="text-xs text-slate-500">
          Approving a video fetches its initial views and starts its own 168
          hours. The submitted time is shown under each video.
=======
          <Btn className="btn">
            Fetch views for all running videos (auto)
          </Btn>{" "}
          <span className="text-xs text-slate-500">
<<<<<<< HEAD
            The 7 days of a video start on the day you approved it. Its earnings
            are added to the blogger's balance only after the 7 days are
            complete.
=======
            Views are fetched twice: at approval (starting views) and once the
            168 hours are over (final views). Gained views = final - starting;
            earnings are calculated on them and count in the balance from then
            on. The hourly cron does this automatically. "Fetch" on a row only
            shows the current live views, it does not change money.
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
          </span>
        </form>
      )}
      {tab === "COMPLETED" && (
        <p className="text-xs text-slate-500">
<<<<<<< HEAD
          These videos finished their 7 days. Their earnings are counted in the
          blogger's balance (payment).
=======
          These videos finished their 168 hours. Gained views (final - starting)
          and earnings are calculated at the final fetch and counted in the
          blogger's balance. You can still correct the views manually.
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
        </p>
      )}
      {tab === "PENDING" && (
        <p className="text-xs text-slate-500">
          The 7 days of a video start on the day you approve it. The submitted
          time is shown under each video.
>>>>>>> parent of f2c3802 (Fetch views only at approval and after 168 hours; auto earnings on gain)
        </p>
      )}
=======
      {tab === "APPROVED" && (
        <form action={fetchAllAction}>
          <button className="btn">Fetch views for all (auto)</button>{" "}
          <span className="text-xs text-slate-500">
            Tracking runs Mon to Saturday 11:59 PM of the submission week.
            Payable views = what the blogger sees and is paid on.
          </span>
        </form>
      )}
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
      <datalist id="reasons">
        {REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {/* Pending / Rejected: compact table (scrolls sideways on small screens) */}
      {isVideoTab && !approvedTab && (
        <div className="card overflow-x-auto">
          <table className="min-w-[640px]">
            <thead>
              <tr>
                <th>Blogger / Agent</th>
                <th>Platform</th>
                <th>Video</th>
<<<<<<< HEAD
                {tab === "PENDING" ? <th>Moderate</th> : <th>Reviewed by</th>}
=======
                {tab === "PENDING" && <th>Moderate</th>}
                {tab !== "PENDING" && <th>Reviewed by</th>}
                {tab === "APPROVED" && (
                  <>
<<<<<<< HEAD
                    <th>Actual views (fetched)</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>Adjusted views (paid on)</th>
<<<<<<< HEAD
                    {me.role === "SUPER" && <th>Earned ₹</th>}
=======
                    {me.role === "SUPER" && (
                      <th>
                        {tab === "TRACKING"
                          ? "Earned so far ₹ (not paid yet)"
                          : "Earned ₹ (counted)"}
=======
                    <th>7-day window</th>
                    <th>Views now (fetched) and gained since approval</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>
                      {tab === "TRACKING"
                        ? "Adjusted views (not final until the 168 h end)"
                        : "Eligible views (final, paid on)"}
                    </th>
                    {me.role === "SUPER" && (
                      <th>
                        {tab === "TRACKING"
                          ? "Earned so far ₹ (not in balance yet)"
                          : "Payment ₹ (final, in balance)"}
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
                      </th>
                    )}
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
                    <th>Update</th>
                  </>
                )}
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
                {tab === "REJECTED" && <th>Reason</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.blogger.name}
                    <div className="text-xs text-slate-500">
                      Agent: {v.blogger.agent?.name ?? "—"}{" "}
                      <PlanBadge code={v.blogger.agent?.plan?.code} />
                    </div>
                  </td>
                  <td>{v.platform}</td>
                  <td>
                    {open(v.url)}
                    <div className="text-xs text-slate-500 break-all">
                      {v.url.slice(0, 60)}
                    </div>
<<<<<<< HEAD
<<<<<<< HEAD
                    <Timeline v={v} now={now} />
=======
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
=======
                    <div className="text-xs text-slate-500">
                      submitted {istTime(v.createdAt)}
                    </div>
                    {v.status === "APPROVED" && v.reviewedAt && (
                      <div className="text-xs text-slate-500">
                        approved {istTime(v.reviewedAt)}
                      </div>
                    )}
                    {v.status === "REJECTED" && v.reviewedAt && (
                      <div className="text-xs text-slate-500">
                        rejected {istTime(v.reviewedAt)}
                      </div>
                    )}
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
                    {owner(v)}
                  </td>
                  {tab === "PENDING" ? (
                    <td className="space-y-1">
                      <form action={reviewVideo}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <button className="btn-g">Approve</button>
                      </form>
                      <form action={reviewVideo} className="flex flex-wrap gap-1">
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                        <input
                          name="reason"
                          list="reasons"
                          required
                          minLength={2}
                          placeholder="Reason (pick or write)"
                          className="inp w-44"
                        />
                        <button className="btn-r">Reject</button>
                      </form>
                    </td>
<<<<<<< HEAD
                  ) : (
                    <td>{v.reviewedBy?.name ?? "—"}</td>
=======
                  )}
                  {tab !== "PENDING" && <td>{v.reviewedBy?.name ?? "—"}</td>}
                  {tab === "APPROVED" && (
                    <>
<<<<<<< HEAD
                      <td>{fmt(v.liveViews)}</td>
=======
                      <td>
                        {tab === "TRACKING" ? (
                          <>
                            <b>Day {trackDay(v.trackEndsAt, now)} of 7</b>
                            <div className="text-xs text-slate-500">
                              from {istDate(v.reviewedAt ?? v.createdAt)} to{" "}
                              {istDate(v.trackEndsAt)}
                            </div>
                          </>
                        ) : (
                          <>
                            <b className="text-green-700">7 days completed ✓</b>
                            <div className="text-xs text-slate-500">
                              on {istDate(v.trackEndsAt)}
                            </div>
                          </>
                        )}
                      </td>
                      <td>
                        <b>{fmt(v.liveViews)}</b>
                        <div className="text-xs text-slate-500">
                          at approval:{" "}
                          {v.baseViews === null
                            ? "not fetched yet"
                            : fmt(v.baseViews)}
                        </div>
                        <div className="text-xs text-slate-500">
                          gained in the 7 days: <b>{fmt(gained(v))}</b>
                        </div>
                      </td>
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
                      <td>{fmt(v.likes)}</td>
                      <td>{fmt(v.comments)}</td>
                      <td>
                        <b>{fmt(v.views)}</b>
<<<<<<< HEAD
                        {!v.viewsEdited &&
                          v.views === 0 &&
                          v.liveViews > 0 &&
                          process.env.PAY_ONLY_ADJUSTED !== "false" && (
                            <div className="text-xs text-amber-700">
                              not adjusted yet, no pay
=======
                        {tab === "TRACKING" && !v.viewsEdited && (
                          <div className="text-xs text-slate-500">
                            calculated at the final fetch
                          </div>
                        )}
                        {tab === "COMPLETED" &&
                          !v.viewsEdited &&
                          (v.baseViews === null || !v.frozen) && (
                            <div className="text-xs text-amber-700">
                              {v.baseViews === null
                                ? "starting views missing: enter the views manually"
                                : "waiting for the final fetch (next hourly run)"}
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
                            </div>
                          )}
                        {v.viewsEdited && (
                          <div className="text-xs text-amber-700">
                            edited
                            {v.views !== v.liveViews
                              ? ` (live ${fmt(v.liveViews)})`
                              : ""}
                          </div>
                        )}
                        {v.frozen && (
                          <div className="text-xs text-slate-500">
                            tracking closed
                          </div>
                        )}
                      </td>
                      {me.role === "SUPER" && <td>{v.earnings.toString()}</td>}
                      <td className="space-y-1">
                        <div className="flex gap-1">
                          <form action={fetchOneAction}>
                            <input type="hidden" name="id" value={v.id} />
                            <button className="btn">Fetch</button>
                          </form>
                          {v.viewsEdited && (
                            <form action={resetToLiveAction}>
                              <input type="hidden" name="id" value={v.id} />
<<<<<<< HEAD
                              <button className="btn">Use live</button>
=======
                              <Btn className="btn">Use live</Btn>
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
                            </form>
                          )}
                        </div>
                        <form action={setViews} className="space-y-1">
                          <input type="hidden" name="id" value={v.id} />
                          <label className="block text-xs text-slate-500">
                            Adjusted views (paid on)
                            <input
                              name="views"
                              type="number"
                              min={0}
                              defaultValue={
<<<<<<< HEAD
                                v.viewsEdited || v.views ? v.views : v.liveViews
=======
                                v.viewsEdited || v.views ? v.views : gained(v)
>>>>>>> parent of f7f844d (Pay only on admin-entered payable views; fetched views are actual views)
                              }
                              className="inp w-full"
                            />
                          </label>
                          <label className="block text-xs text-slate-500">
                            Likes
                            <input
                              name="likes"
                              type="number"
                              min={0}
                              defaultValue={v.likes}
                              className="inp w-full"
                            />
                          </label>
                          <label className="block text-xs text-slate-500">
                            Comments
                            <input
                              name="comments"
                              type="number"
                              min={0}
                              defaultValue={v.comments}
                              className="inp w-full"
                            />
                          </label>
                          <button className="btn">Save</button>
                        </form>
                        <details>
                          <summary className="text-xs underline cursor-pointer">
                            7-day history
                          </summary>
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Live</th>
                                <th>Payable</th>
                                <th>Likes</th>
                                <th>Comments</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats
                                .filter((s) => s.videoId === v.id)
                                .map((s) => (
                                  <tr key={s.id}>
                                    <td>{s.day.toISOString().slice(0, 10)}</td>
                                    <td>{fmt(s.liveViews)}</td>
                                    <td>{fmt(s.payViews)}</td>
                                    <td>{fmt(s.likes)}</td>
                                    <td>{fmt(s.comments)}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </details>
                      </td>
                    </>
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
                  )}
                  {tab === "REJECTED" && <td>{v.rejectReason}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && (
            <p className="text-sm text-slate-500 p-2">Nothing here.</p>
          )}
        </div>
      )}

      {/* Tracking / Completed: one card per video (see VideoCard.tsx) */}
      {approvedTab && (
        <div className="space-y-4">
          {list.map((v) => (
            <VideoCard
              key={v.id}
              v={v}
              stats={stats.filter((s) => s.videoId === v.id)}
              tab={tab as "TRACKING" | "COMPLETED"}
              now={now}
              isSuper={me.role === "SUPER"}
            />
          ))}
          {!list.length && (
            <p className="card text-sm text-slate-500">Nothing here.</p>
          )}
        </div>
      )}

      {tab === "REPOSTS" && (
        <div className="card overflow-x-auto">
          <p className="text-sm text-slate-500">
            Links that were submitted again (duplicates). They are not counted.
            Records older than 14 days are deleted automatically.
          </p>
          <table className="min-w-[560px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Submitted again by</th>
                <th>Link</th>
                <th>Original owner</th>
                <th>Original status</th>
              </tr>
            </thead>
            <tbody>
              {reposts.map((r) => (
                <tr key={r.id}>
                  <td>{r.createdAt.toISOString().slice(0, 10)}</td>
                  <td>{r.blogger.name}</td>
                  <td>{open(r.url)}</td>
                  <td>{r.original?.blogger.name ?? "—"}</td>
                  <td>{r.original?.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!reposts.length && (
            <p className="text-sm text-slate-500 p-2">No reposts.</p>
          )}
        </div>
      )}
    </>
  );
}
