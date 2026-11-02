import type { Prisma } from "@prisma/client";
import Btn from "@/app/admin/Btn";
import { db } from "@/lib/db";
import { pageStaff } from "@/lib/auth";
import { istDateTime, trackState } from "@/lib/week";
import PlanBadge from "../PlanBadge";
import { reviewVideo, fetchAllAction } from "../actions";
import VideoCard from "./VideoCard";
export const dynamic = "force-dynamic";

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
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
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
        <form action={fetchAllAction} className="flex flex-wrap items-center gap-2">
          <Btn className="btn">Run due fetches now</Btn>
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
        </p>
      )}
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
                {tab === "PENDING" ? <th>Moderate</th> : <th>Reviewed by</th>}
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
                    <Timeline v={v} now={now} />
                    {owner(v)}
                  </td>
                  {tab === "PENDING" ? (
                    <td className="space-y-1">
                      <form action={reviewVideo}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <Btn className="btn-g">Approve</Btn>
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
                        <Btn className="btn-r">Reject</Btn>
                      </form>
                    </td>
                  ) : (
                    <td>{v.reviewedBy?.name ?? "—"}</td>
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
