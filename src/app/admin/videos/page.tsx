import { db } from "@/lib/db";
import { pageStaff } from "@/lib/auth";
import PlanBadge from "../PlanBadge";
import {
  reviewVideo,
  setViews,
  fetchOneAction,
  fetchAllAction,
  resetToLiveAction,
} from "../actions";
export const dynamic = "force-dynamic";
const TABS = ["PENDING", "APPROVED", "REJECTED", "REPOSTS"] as const;
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
      <div className="flex gap-4 text-sm">
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
      {tab === "APPROVED" && (
        <form action={fetchAllAction}>
          <button className="btn">Fetch views for all (auto)</button>{" "}
          <span className="text-xs text-slate-500">
            Tracking runs Mon to Saturday 11:59 PM of the submission week.
            Payable views = what the blogger sees and is paid on.
          </span>
        </form>
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
                {tab === "APPROVED" && (
                  <>
                    <th>Actual views (fetched)</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>Adjusted views (paid on)</th>
                    {me.role === "SUPER" && <th>Earned ₹</th>}
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
                    {owner(v)}
                  </td>
                  {tab === "PENDING" && (
                    <td className="space-y-1">
                      <form action={reviewVideo}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <button className="btn-g">Approve</button>
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
                        <button className="btn-r">Reject</button>
                      </form>
                    </td>
                  )}
                  {tab !== "PENDING" && <td>{v.reviewedBy?.name ?? "—"}</td>}
                  {tab === "APPROVED" && (
                    <>
                      <td>{fmt(v.liveViews)}</td>
                      <td>{fmt(v.likes)}</td>
                      <td>{fmt(v.comments)}</td>
                      <td>
                        <b>{fmt(v.views)}</b>
                        {!v.viewsEdited &&
                          v.views === 0 &&
                          v.liveViews > 0 &&
                          process.env.PAY_ONLY_ADJUSTED !== "false" && (
                            <div className="text-xs text-amber-700">
                              not adjusted yet, no pay
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
                              <button className="btn">Use live</button>
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
                                v.viewsEdited || v.views ? v.views : v.liveViews
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
