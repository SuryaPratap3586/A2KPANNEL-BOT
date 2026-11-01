import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// One-time move to the exact 168-hour rule: videos that are STILL tracking get trackEndsAt = approval timestamp + 168 h.
// Videos that already completed are not touched, so no balance goes down and nothing already paid changes.
// Safe to run more than once. Usage: npm run db:retrack
async function main() {
  const n = await db.$executeRaw`
    UPDATE "Video" SET "trackEndsAt" = "reviewedAt" + interval '168 hours', "frozen" = false
    WHERE "status" = 'APPROVED' AND "reviewedAt" IS NOT NULL AND "trackEndsAt" > now()
      AND "trackEndsAt" <> "reviewedAt" + interval '168 hours'`;
  console.log(`Updated ${n} running video(s) to approval time + 168 hours.`);
}
main().catch((e) => console.error("ERROR:", e.message)).finally(() => db.$disconnect());
