// Time rules, all in IST (UTC+5:30, no daylight saving):
//   submit Monday-Friday; every approved video is then tracked for its own 168 hours.
const IST = 5.5 * 3600_000,
  DAY = 86_400_000;
export const toIST = (d: Date) => new Date(d.getTime() + IST);

/** Monday 00:00 IST of the week containing d (as a real instant). */
export function weekStartIST(d = new Date()): Date {
  const t = toIST(d);
  const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow) - IST,
  );
}
/** Saturday 23:59:59 IST of the week that started at ws. */
export const weekEnd = (ws: Date) =>
  new Date(ws.getTime() + 5 * DAY + DAY - 1000);

/** Links can be submitted Monday-Friday. Set ENFORCE_WEEK_WINDOW="false" to test on weekends. */
export function submissionOpen(d = new Date()): boolean {
  if (process.env.ENFORCE_WEEK_WINDOW === "false") return true;
  return (toIST(d).getUTCDay() + 6) % 7 <= 4;
}
/** IST calendar date as a UTC-midnight Date (for @db.Date columns). */
export function istDay(d = new Date()): Date {
  const t = toIST(d);
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
  );
}

/** Every video is tracked for its OWN 7 days: exactly 168 hours from the moment the admin APPROVES it.
 *  Approved Monday 10:30 -> completes next Monday 10:30; approved Tuesday 16:05 -> completes next Tuesday 16:05. */
export const TRACK_MS = 168 * 3600_000;
export function trackEnd(approved = new Date()): Date {
  return new Date(approved.getTime() + TRACK_MS);
}
/** A completed video stays on the Completed tab for 3 more days, then it moves to the Archive. */
export const ARCHIVE_AFTER_MS = 3 * DAY;
export const archiveAt = (trackEndsAt: Date) =>
  new Date(trackEndsAt.getTime() + ARCHIVE_AFTER_MS);

/** Start of the tracking window (= the approval timestamp). */
export const trackStart = (trackEndsAt: Date) =>
  new Date(trackEndsAt.getTime() - TRACK_MS);

/** Which tracking day (1 to 7) a video is on; stays 7 once the 168 hours are complete. */
export function trackDay(trackEndsAt: Date, now = new Date()): number {
  const start = trackStart(trackEndsAt).getTime();
  return Math.min(
    7,
    Math.max(1, Math.floor((now.getTime() - start) / DAY) + 1),
  );
}

export type TrackState = "PENDING_APPROVAL" | "TRACKING" | "COMPLETED" | "REJECTED";
/** Pending Approval -> Tracking in Progress -> 7 Days Completed (or Rejected). Completion is automatic: it only depends on the clock. */
export function trackState(
  v: { status: string; trackEndsAt: Date },
  now = new Date(),
): TrackState {
  if (v.status === "PENDING") return "PENDING_APPROVAL";
  if (v.status === "REJECTED") return "REJECTED";
  return v.trackEndsAt <= now ? "COMPLETED" : "TRACKING";
}

/** "01 Nov 2026, 10:30 am" in IST (works on the server and in the browser). */
export const istDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
