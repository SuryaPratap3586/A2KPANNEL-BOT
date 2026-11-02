import { NextResponse } from "next/server";
import crypto from "crypto";
import { archiveCompleted, cleanupOld, fetchAll } from "@/lib/views";
import { creditEligible } from "@/lib/commission";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Call EVERY HOUR with header  Authorization: Bearer $CRON_SECRET  (each video ends exactly 168 h after its approval)
export async function GET(req: Request) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
  if (
    !process.env.CRON_SECRET ||
    given.length !== want.length ||
    !crypto.timingSafeEqual(given, want)
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const fetched = await fetchAll(undefined, 50_000);
  const archived = await archiveCompleted(); // completed more than 3 days ago -> Archive (nothing is deleted)
  const cleaned = await cleanupOld();
  const credited = await creditEligible();
  return NextResponse.json({ ...fetched, archived, cleaned, credited });
}
