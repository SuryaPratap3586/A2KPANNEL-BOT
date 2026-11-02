import type { Prisma, VideoStat } from "@prisma/client";
import Btn from "@/app/admin/Btn";
import { archiveAt, istDateTime, trackDay } from "@/lib/week";
import { accountName } from "@/lib/platforms";
import PlanBadge from "../PlanBadge";
import { deleteArchivedVideo, setActualViews, setViews, fetchOneAction } from "../actions";
import {
  Bars,
  Bubble,
  Calendar,
  Check,
  Chevron,
  Clock,
  Coins,
  Cross,
  Eye,
  LinkIcon,
  Pencil,
  PlatformLogo,
  Refresh,
  Save,
  Thumb,
  UpDown,
} from "./icons";

export type CardVideo = Prisma.VideoGetPayload<{
  include: {
    blogger: { include: { agent: { include: { plan: true } } } };
    reviewedBy: true;
    account: true;
  };
}>;

const fmt = (n: number) => n.toLocaleString("en-IN");

/** Figure tile: icon, label, big number, small note. */
function Tile({
  icon,
  label,
  value,
  note,
  tone = "text-slate-900",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 min-w-0">
      <div className="text-blue-600 mt-1">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm text-slate-600">{label}</div>
        <div className={"text-2xl font-bold leading-tight break-words " + tone}>
          {value}
        </div>
        {note && <div className="text-xs text-slate-500 mt-0.5">{note}</div>}
      </div>
    </div>
  );
}

/** Heading of a block inside "Details". */
function Heading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
      <span className="text-blue-600">{icon}</span>
      {children}
    </h3>
  );
}

/** Small figure next to an icon (live views / likes / comments). */
function Mini({ icon, label, value, tone = "text-slate-900" }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="px-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-blue-600">{icon}</span>
        {label}
      </div>
      <div className={"text-xl font-bold " + tone}>{value}</div>
    </div>
  );
}

const TimeRow = ({ ok = true, children }: { ok?: boolean; children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-sm text-slate-700">
    {ok ? (
      <Check className="w-5 h-5 text-green-600 shrink-0" />
    ) : (
      <Clock className="w-5 h-5 text-slate-400 shrink-0" />
    )}
    <span>{children}</span>
  </div>
);

/** One approved video (Tracking or Completed tab). */
export default function VideoCard({
  v,
  stats,
  tab,
  now,
  isSuper,
}: {
  v: CardVideo;
  stats: VideoStat[];
  tab: "TRACKING" | "COMPLETED" | "ARCHIVE";
  now: Date;
  isSuper: boolean;
}) {
  const done = tab !== "TRACKING";
  const archived = tab === "ARCHIVE";
  const diff =
    v.baseViews !== null && v.finalViews !== null
      ? Math.max(0, v.finalViews - v.baseViews)
      : null;
  const failed = v.fetchStatus === "FAILED";
  const gaveUp = done && v.frozen && v.finalViews === null; // 7-day fetch failed for 24 h: automatic fetching stopped
  const needManual =
    (v.baseViews === null && (failed || done)) ||
    (done && v.finalViews === null && (failed || gaveUp));
  const needPayable = done && !v.viewsEdited;
  const attention = failed || needManual || needPayable;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 md:p-5 space-y-4">
      {/* ── header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <PlatformLogo platform={v.platform} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-lg font-bold text-slate-900">{v.blogger.name}</span>
              <span className="text-slate-400">·</span>
              <span className="font-semibold text-slate-700">
                Agent: {v.blogger.agent?.name ?? "—"}
              </span>
              <PlanBadge code={v.blogger.agent?.plan?.code} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 text-sm">
              <span className="font-bold tracking-wide text-slate-800">{v.platform}</span>
              <span className="font-semibold text-slate-700 break-all">{accountName(v.account)}</span>
              <a
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                href={v.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <LinkIcon className="w-4 h-4" /> Open ↗
              </a>
            </div>
            <div className="text-sm text-slate-500 break-all">{v.url}</div>
            <div className="flex flex-wrap items-center gap-x-2 text-sm mt-0.5">
              {v.ownerVerified ? (
                <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                  <Check className="w-4 h-4 text-green-600" /> linked account
                </span>
              ) : (
                <span className="text-amber-700 font-medium">⚠ owner not verified</span>
              )}
              <span className="text-slate-300">|</span>
              <span className="text-slate-600">Reviewed by {v.reviewedBy?.name ?? "—"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 ml-auto">
          <span
            className={
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-semibold " +
              (archived
                ? "border-slate-300 bg-slate-100 text-slate-700"
                : done
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-blue-200 bg-blue-50 text-blue-700")
            }
          >
            <Calendar className="w-5 h-5" />
            {archived ? "Completed · archived" : done ? "7 days completed" : `Day ${trackDay(v.trackEndsAt, now)} of 7`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <Clock className="w-4 h-4" />
            {done ? "ended" : "ends"} {istDateTime(v.trackEndsAt)}
          </span>
          {failed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
              <Cross className="w-3.5 h-3.5 text-red-600" /> Fetch failed
            </span>
          )}
        </div>
      </div>

      {/* ── four figures ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          icon={<Eye className="w-7 h-7" />}
          label="Initial views"
          value={v.baseViews === null ? "—" : fmt(v.baseViews)}
          note={v.baseViews !== null && v.baseManual ? "entered manually" : undefined}
        />
        <Tile
          icon={<Calendar className="w-7 h-7" />}
          label="7-day views"
          value={v.finalViews === null ? "—" : fmt(v.finalViews)}
          note={
            v.finalViews !== null
              ? v.finalManual
                ? "entered manually"
                : undefined
              : done
                ? gaveUp
                  ? "fetch failed: enter manually"
                  : "next hourly fetch"
                : undefined
          }
        />
        <Tile
          icon={<UpDown className="w-7 h-7" />}
          label="View difference"
          value={diff === null ? "—" : fmt(diff)}
          tone={diff === null ? "text-slate-900" : "text-blue-700"}
        />
        <Tile
          icon={<Coins className="w-7 h-7" />}
          label="Payable views"
          value={v.viewsEdited ? fmt(v.views) : "—"}
          tone={v.viewsEdited ? "text-green-700" : "text-slate-900"}
          note={
            v.viewsEdited
              ? isSuper
                ? `payment ₹${v.earnings.toString()}`
                : undefined
              : done
                ? "not entered yet: no payment"
                : undefined
          }
        />
      </div>

      {/* ── details (opens by itself when something needs you) ── */}
      <details open={attention} className="group rounded-xl border border-blue-200 overflow-hidden">
        <summary className="flex items-center justify-between gap-2 bg-blue-50/70 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Bars className="w-6 h-6 text-blue-600" /> Details
            {attention && (
              <span className="text-xs font-medium text-amber-700">
                ({failed ? "fetch failed" : needManual ? "views needed" : "payable views not entered"})
              </span>
            )}
          </span>
          <Chevron className="w-6 h-6 text-slate-600 rotate-180 group-open:rotate-0 transition-transform" />
        </summary>

        <div className="p-4 space-y-5 divide-y divide-slate-100 [&>*+*]:pt-5">
          {/* timeline & fetch status */}
          <section className="space-y-3">
            <Heading icon={<Clock className="w-6 h-6" />}>Timeline &amp; Fetch Status</Heading>
            <div className="grid gap-3 xl:grid-cols-[auto_auto_1fr_auto] items-stretch rounded-xl bg-slate-50 p-3">
              <div className="space-y-2">
                <TimeRow>
                  Submitted: {istDateTime(v.createdAt)} (via {v.submittedVia === "BOT" ? "bot" : "app"})
                </TimeRow>
                <TimeRow>Approved: {istDateTime(v.reviewedAt)}</TimeRow>
              </div>
              <div className="space-y-2 xl:border-l xl:border-slate-200 xl:pl-4">
                <TimeRow>Tracking start: {istDateTime(v.reviewedAt ?? v.createdAt)}</TimeRow>
                <TimeRow ok={done}>Tracking end: {istDateTime(v.trackEndsAt)}</TimeRow>
                <TimeRow ok={archived}>
                  {archived ? "Archived" : "Moves to archive"}: {istDateTime(v.archivedAt ?? archiveAt(v.trackEndsAt))}
                </TimeRow>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-200 xl:border-l xl:border-slate-200">
                <Mini icon={<Eye className="w-4 h-4" />} label="Live views" value={fmt(v.liveViews)} tone="text-blue-700" />
                <Mini icon={<Thumb className="w-4 h-4" />} label="Likes" value={fmt(v.likes)} />
                <Mini icon={<Bubble className="w-4 h-4" />} label="Comments" value={fmt(v.comments)} />
              </div>
              <div className="xl:border-l xl:border-slate-200 xl:pl-4 space-y-2">
                <div className="text-sm text-slate-600">Last success:</div>
                <div className="font-bold text-slate-900">
                  {v.lastFetchedAt ? istDateTime(v.lastFetchedAt) : "—"}
                </div>
                {v.frozen ? (
                  <div className="text-xs text-slate-500">Fetching closed</div>
                ) : (
                  <form action={fetchOneAction}>
                    <input type="hidden" name="id" value={v.id} />
                    <Btn className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
                      <Refresh className="w-4 h-4" /> Fetch now
                    </Btn>
                  </form>
                )}
              </div>
            </div>
            {failed ? (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                <Cross className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  Last fetch failed {istDateTime(v.fetchTriedAt)}
                  {v.fetchError && (
                    <>
                      : <b>{v.fetchError}</b>
                    </>
                  )}
                  {gaveUp && (
                    <div className="text-xs">
                      Automatic fetching stopped after 24 hours of failures. Enter the 7-day views manually below.
                    </div>
                  )}
                </div>
              </div>
            ) : v.fetchStatus === "OK" ? (
              <div className="text-xs text-slate-500">
                Last fetch succeeded {istDateTime(v.fetchTriedAt)}.{" "}
                {!done && v.baseViews !== null && "“Fetch now” only refreshes the live numbers (no money changes)."}
              </div>
            ) : (
              <div className="text-xs text-slate-500">Not fetched yet.</div>
            )}
          </section>

          {/* manual actual views */}
          <section className="space-y-3">
            <Heading icon={<Pencil className="w-6 h-6" />}>
              Enter views manually
              {needManual && <span className="text-xs font-medium text-red-700">(needed)</span>}
            </Heading>
            <form action={setActualViews} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="tab" value={tab} />
              <label className="text-sm text-slate-700">
                Initial views
                <input
                  name="initial"
                  type="number"
                  min={0}
                  placeholder={v.baseViews === null ? "views at approval" : fmt(v.baseViews)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm text-slate-700">
                7-day views
                <input
                  name="final"
                  type="number"
                  min={0}
                  disabled={!done}
                  placeholder={!done ? "after the 168 hours" : v.finalViews === null ? "views after 7 days" : fmt(v.finalViews)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                />
              </label>
              <Btn className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 font-semibold text-white hover:bg-slate-700">
                <Save className="w-5 h-5" /> Save actual views
              </Btn>
            </form>
            <p className="text-xs text-slate-500">
              Use this when fetching failed. Actual views only make the difference; they never create a payment.
            </p>
          </section>

          {/* payable views & payment (Completed only) */}
          {done && (
            <section className="space-y-3">
              <Heading icon={<Coins className="w-6 h-6" />}>
                Payable views &amp; payment
                {needPayable && <span className="text-xs font-medium text-amber-700">(not entered)</span>}
              </Heading>
              <form action={setViews} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] items-end">
                <input type="hidden" name="id" value={v.id} />
                <label className="text-sm text-slate-700">
                  Payable views (payment is calculated from this)
                  <input
                    name="views"
                    type="number"
                    min={0}
                    required
                    defaultValue={v.viewsEdited ? v.views : (diff ?? 0)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Likes
                  <input name="likes" type="number" min={0} defaultValue={v.likes} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm text-slate-700">
                  Comments
                  <input name="comments" type="number" min={0} defaultValue={v.comments} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <Btn className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 font-semibold text-white hover:bg-green-500">
                  <Save className="w-5 h-5" /> Save payable views
                </Btn>
              </form>
              {needPayable && (
                <p className="text-xs text-slate-500">
                  {diff === null
                    ? "No view difference yet (initial or 7-day views missing): check the video and enter the views."
                    : "Filled with the view difference. Nothing is paid until you press Save."}
                </p>
              )}
            </section>
          )}

          {/* day-wise history */}
          <section className="space-y-3">
            <Heading icon={<Bars className="w-6 h-6" />}>Day-wise history ({stats.length})</Heading>
            {stats.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[480px] w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Date", "Live views", "Payable", "Likes", "Comments"].map((h) => (
                        <th key={h} className="px-4 py-2 font-semibold text-slate-800 border-b border-slate-200 border-r last:border-r-0">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2 border-r border-slate-100">{s.day.toISOString().slice(0, 10)}</td>
                        <td className="px-4 py-2 border-r border-slate-100">{fmt(s.liveViews)}</td>
                        <td className="px-4 py-2 border-r border-slate-100">{fmt(s.payViews)}</td>
                        <td className="px-4 py-2 border-r border-slate-100">{fmt(s.likes)}</td>
                        <td className="px-4 py-2">{fmt(s.comments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No fetches saved yet.</p>
            )}
          </section>

          {/* archive: super admin can delete (hidden everywhere; earnings and payments stay in the balance) */}
          {archived && isSuper && (
            <section className="space-y-2">
              <Heading icon={<Cross className="w-6 h-6" />}>Delete from archive</Heading>
              <form action={deleteArchivedVideo} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={v.id} />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="confirm" value="yes" required /> I want to delete this video
                </label>
                <Btn className="btn-r">Delete video</Btn>
              </form>
              <p className="text-xs text-slate-500">
                The video disappears from the panel and the apps. Its earnings (₹{v.earnings.toString()}) stay in the
                blogger&apos;s balance and paid money is not changed.
              </p>
            </section>
          )}
        </div>
      </details>
    </div>
  );
}
