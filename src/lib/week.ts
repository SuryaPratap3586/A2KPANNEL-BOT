<<<<<<< HEAD
<<<<<<< HEAD
// Time rules, all in IST (UTC+5:30, no daylight saving):
//   submit Monday-Friday; every approved video is then tracked for its own 168 hours.
=======
// Weekly cycle, all in IST (UTC+5:30, no daylight saving):
//   submit Monday-Friday, views counted until Saturday 23:59, then frozen.
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
const IST = 5.5 * 3600_000,
  DAY = 86_400_000;
=======
// Weekly cycle, all in IST (UTC+5:30, no daylight saving):
//   submit Monday-Friday, views counted until Saturday 23:59, then frozen.
const IST = 5.5 * 3600_000, DAY = 86_400_000;
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
export const toIST = (d: Date) => new Date(d.getTime() + IST);

/** Monday 00:00 IST of the week containing d (as a real instant). */
export function weekStartIST(d = new Date()): Date {
  const t = toIST(d);
  const dow = (t.getUTCDay() + 6) % 7;                         // Monday = 0
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow) - IST);
}
/** Saturday 23:59:59 IST of the week that started at ws. */
export const weekEnd = (ws: Date) => new Date(ws.getTime() + 5 * DAY + DAY - 1000);

/** Links can be submitted Monday-Friday. Set ENFORCE_WEEK_WINDOW="false" to test on weekends. */
export function submissionOpen(d = new Date()): boolean {
  if (process.env.ENFORCE_WEEK_WINDOW === "false") return true;
  return (toIST(d).getUTCDay() + 6) % 7 <= 4;
}
/** IST calendar date as a UTC-midnight Date (for @db.Date columns). */
export function istDay(d = new Date()): Date {
  const t = toIST(d);
<<<<<<< HEAD
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
  );
}

/** Every video is tracked for its OWN 7 days, counted from the day the admin APPROVES it (IST): day 1 = approval day, day 7 ends at 23:59:59 IST.
 *  Approved on Monday -> ends Sunday night, approved on Tuesday -> ends Monday night, and so on. */
export function trackEnd(approved = new Date()): Date {
  return new Date(istDay(approved).getTime() - IST + 7 * DAY - 1000);
}

/** Which tracking day (1 to 7) a video is on; stays 7 once the 7 days are complete. */
export function trackDay(trackEndsAt: Date, now = new Date()): number {
  const start = trackEndsAt.getTime() + 1000 - 7 * DAY;
  return Math.min(
    7,
    Math.max(1, Math.floor((now.getTime() - start) / DAY) + 1),
  );
=======
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
}
