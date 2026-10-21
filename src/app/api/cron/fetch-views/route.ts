import { NextResponse } from "next/server";
import crypto from "crypto";
import { cleanupOld, fetchAll } from "@/lib/views";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Call every night at 23:59 IST (Asia/Kolkata) with header  Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
  if (!process.env.CRON_SECRET || given.length !== want.length || !crypto.timingSafeEqual(given, want))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const fetched = await fetchAll(undefined, 50_000);
  const cleaned = await cleanupOld();
  return NextResponse.json({ ...fetched, cleaned });
}
