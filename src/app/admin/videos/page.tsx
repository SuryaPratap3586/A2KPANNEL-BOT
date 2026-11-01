import type { Prisma } from "@prisma/client";
import Btn from "@/app/admin/Btn";
import { db } from "@/lib/db";
import { pageStaff } from "@/lib/auth";
import { istDateTime, trackDay, trackState } from "@/lib/week";
import PlanBadge from "../PlanBadge";
import {
  reviewVideo,
  setViews,
  fetchOneAction,
  fetchAllAction,
} from "../actions";
export const dynamic = "force-dynamic";

// Every approved video has its OWN 7 days (day 1 = the day the admin APPROVED it). While they run, the video is in "Tracking";
// when the 7 days are over it moves to "Completed", and only then its earnings count in the blogger's balance.
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
const istDate = (d: Date) =>
  new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const STATE: Record<string, [string, string]> = {
  PENDING_APPROVAL: ["Pending Approval", "text-amber-700"],
  TRACKING: ["Tracking in Progress", "text-blue-700"],
  COMPLETED: ["7 Days Completed", "text-green-700"],
  REJECTED: ["Rejected", "text-red-700"],
};
/** Submission, approval and tracking timestamps (IST). Tracking = approval timestamp + exactly 168 hours. */
function Timeline({
  v,
  now,
}: {
  v: {
    status: string;
    createdAt: Date;
    reviewedAt: Date | null;
    trackEndsAt: Date;
    submittedVia: string;
  };
  now: Date;
}) {
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
const gained = (v: { liveViews: number; baseViews: number | null }) =>
  Math.max(0, v.liveViews - (v.baseViews ?? v.liveViews)); // views gained since approval

// Visible to every admin: all bloggers' videos, approve/reject with reason, fetch views (auto) or type views (manual).
export default async function Videos({
  searchParams,
}: {
  searchParams: { status?: string; msg?: string };
}) {
  const me = await pageStaff();
  const asked =
    searchParams.status === "APPROVED" ? "TRACKING" : searchParams.status; // old links
  const tab = (TABS as readonly string[]).includes(asked ?? "")
    ? (asked as (typeof TABS)[number])
    : "PENDING";
  const now = new Date();
  const isVideoTab = tab !== "REPOSTS";
  const approvedTab = tab === "TRACKING" || tab === "COMPLETED";
  const where: Prisma.VideoWhereInput =
    tab === "PENDING"
      ? { status: "PENDING" }
      : tab === "REJECTED"
        ? { status: "REJECTED" }
        : tab === "TRACKING"
          ? { status: "APPROVED", trackEndsAt: { gt: now } }
          : { status: "APPROVED", trackEndsAt: { lte: now } };
  const orderBy: Prisma.VideoOrderByWithRelationInput =
    tab === "PENDING"
      ? { createdAt: "asc" }
      : tab === "TRACKING"
        ? { trackEndsAt: "asc" }
        : tab === "COMPLETED"
          ? { trackEndsAt: "desc" }
          : { createdAt: "desc" };

  const list = isVideoTab
    ? await db.video.findMany({
        where,
        include: {
          blogger: { include: { agent: { include: { plan: true } } } },
          reviewedBy: true,
        },
        orderBy,
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
  const [counts, repostCount, nTrack, nDone] = await Promise.all([
    db.video.groupBy({ by: ["status"], _count: { _all: true } }),
    db.repost.count(),
    db.video.count({ where: { status: "APPROVED", trackEndsAt: { gt: now } } }),
    db.video.count({
      where: { status: "APPROVED", trackEndsAt: { lte: now } },
    }),
  ]);
  const stats =
    approvedTab && list.length
      ? await db.videoStat.findMany({
          where: { videoId: { in: list.map((v) => v.id) } },
          orderBy: { day: "asc" },
        })
      : [];
  const n = (t: (typeof TABS)[number]) =>
    t === "REPOSTS"
      ? repostCount
      : t === "TRACKING"
        ? nTrack
        : t === "COMPLETED"
          ? nDone
          : (counts.find((c) => c.status === t)?._count._all ?? 0);
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
      <div className="flex flex-wrap gap-4 text-sm">
        {TABS.map((t) => (
          <a
            key={t}
            href={`?status=${t}`}
            className={"underline " + (t === tab ? "font-bold" : "")}
          >
            {LABEL[t]} ({n(t)})
          </a>
        ))}
      </div>
      {tab === "TRACKING" && (
        <form action={fetchAllAction}>
          <Btn className="btn">
            Run due fetches now (starting + final views)
          </Btn>{" "}
          <span className="text-xs text-slate-500">
            Actual views are fetched twice: at approval (starting views) and once
            the 168 hours are over (final views); the hourly cron does this
            automatically. Fetched views never create a payment: after the 168
            hours you enter the payable views on the Completed tab, and the
            payment is calculated only from them.
          </span>
        </form>
      )}
      {tab === "COMPLETED" && (
        <p className="text-xs text-slate-500">
          These videos finished their 168 hours. Check the actual views (final -
          starting = gained), then enter the payable views and press Save: the
          payment is calculated only from the payable views you enter and goes
          into the blogger's balance. You can change them again later; only the
          difference is added or removed.
        </p>
      )}
      {tab === "PENDING" && (
        <p className="text-xs text-slate-500">
          Approving a video fetches its starting views and starts its own 168
          hours. The submitted time is shown under each video.
        </p>
      )}
      <datalist id="reasons">
        {REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {isVideoTab && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Blogger / Agent</th>
                <th>Platform</th>
                <th>Video</th>
                {tab === "PENDING" && <th>Moderate</th>}
                {tab !== "PENDING" && <th>Reviewed by</th>}
                {approvedTab && (
                  <>
                    <th>7-day window</th>
                    <th>Actual views (fetched)</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>
                      {tab === "TRACKING"
                        ? "Payable views (entered after the 168 h)"
                        : "Payable views (entered by admin, paid on)"}
                    </th>
                    {me.role === "SUPER" && (
                      <th>
                        {tab === "TRACKING"
                          ? "Payment ₹ (after the 168 h)"
                          : "Payment ₹ (from payable views)"}
                      </th>
                    )}
                    <th>Update</th>
                  </>
                )}
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
                    <div className="text-xs text-slate-500">
                      {v.url.slice(0, 44)}
                    </div>
                    <Timeline v={v} now={now} />
                    {owner(v)}
                  </td>
                  {tab === "PENDING" && (
                    <td className="space-y-1">
                      <form action={reviewVideo}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <Btn className="btn-g">Approve</Btn>
                      </form>
                      <form action={reviewVideo} className="flex gap-1">
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
                        <Btn className="btn-r">Reject</Btn>
                      </form>
                    </td>
                  )}
                  {tab !== "PENDING" && <td>{v.reviewedBy?.name ?? "—"}</td>}
                  {approvedTab && (
                    <>
                      <td>
                        {tab === "TRACKING" ? (
                          <>
                            <b>Day {trackDay(v.trackEndsAt, now)} of 7</b>
                            <div className="text-xs text-slate-500">
                              {istDateTime(v.reviewedAt ?? v.createdAt)} →{" "}
                              {istDateTime(v.trackEndsAt)} (168 h)
                            </div>
                          </>
                        ) : (
                          <>
                            <b className="text-green-700">7 days completed ✓</b>
                            <div className="text-xs text-slate-500">
                              at {istDateTime(v.trackEndsAt)}
                            </div>
                          </>
                        )}
                      </td>
                      <td>
                        <b>{fmt(v.liveViews)}</b>
                        <div className="text-xs text-slate-500">
                          starting (at approval):{" "}
                          {v.baseViews === null
                            ? "not fetched"
                            : fmt(v.baseViews)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {tab === "COMPLETED" ? "final gained" : "gained so far"}:{" "}
                          <b>{fmt(gained(v))}</b>
                        </div>
                      </td>
                      <td>{fmt(v.likes)}</td>
                      <td>{fmt(v.comments)}</td>
                      <td>
                        {tab === "TRACKING" ? (
                          <div className="text-xs text-slate-500">
                            enter after {istDateTime(v.trackEndsAt)}
                          </div>
                        ) : v.viewsEdited ? (
                          <>
                            <b>{fmt(v.views)}</b>
                            <div className="text-xs text-green-700">
                              entered by admin
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-amber-700">
                            not entered yet: no payment
                          </div>
                        )}
                        {tab === "COMPLETED" && !v.frozen && (
                          <div className="text-xs text-slate-500">
                            final fetch pending (next hourly run)
                          </div>
                        )}
                        {tab === "COMPLETED" && v.baseViews === null && (
                          <div className="text-xs text-amber-700">
                            starting views were not fetched: check the views on
                            the video itself
                          </div>
                        )}
                        {v.frozen && (
                          <div className="text-xs text-slate-500">
                            fetching closed
                          </div>
                        )}
                      </td>
                      {me.role === "SUPER" && <td>{v.earnings.toString()}</td>}
                      <td className="space-y-1">
                        <div className="flex gap-1">
                          <form action={fetchOneAction}>
                            <input type="hidden" name="id" value={v.id} />
                            <Btn className="btn">Fetch</Btn>
                          </form>
                        </div>
                        {tab === "TRACKING" ? (
                          <p className="text-xs text-slate-500">
                            Payable views can be entered once the 168 hours are
                            complete.
                          </p>
                        ) : (
                        <form action={setViews} className="space-y-1">
                          <input type="hidden" name="id" value={v.id} />
                          <label className="block text-xs text-slate-500">
                            Payable views (payment is calculated from this)
                            <input
                              name="views"
                              type="number"
                              min={0}
                              required
                              defaultValue={v.viewsEdited ? v.views : gained(v)}
                              className="inp w-full"
                            />
                          </label>
                          {!v.viewsEdited && (
                            <p className="text-xs text-slate-500">
                              Filled with the fetched gained views. Nothing is
                              paid until you press Save.
                            </p>
                          )}
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
                          <Btn className="btn">Save</Btn>
                        </form>
                        )}
                        <details>
                          <summary className="text-xs underline cursor-pointer">
                            7-day history
                          </summary>
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Live</th>
                                <th>Gained</th>
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
                                    <td>
                                      {fmt(
                                        Math.max(
                                          0,
                                          s.liveViews -
                                            (v.baseViews ?? s.liveViews),
                                        ),
                                      )}
                                    </td>
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

      {tab === "REPOSTS" && (
        <div className="card">
          <p className="text-sm text-slate-500">
            Links that were submitted again (duplicates). They are not counted.
            Records older than 14 days are deleted automatically.
          </p>
          <table>
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
