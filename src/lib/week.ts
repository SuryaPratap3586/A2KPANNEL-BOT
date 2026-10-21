// Weekly cycle, all in IST (UTC+5:30, no daylight saving):
//   submit Monday-Friday, views counted until Saturday 23:59, then frozen.
const IST = 5.5 * 3600_000, DAY = 86_400_000;
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
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}
