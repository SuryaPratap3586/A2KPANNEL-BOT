import "dotenv/config";
import { PrismaClient, Platform } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD;   // login looks emails up in lowercase
  if (!email || !pw || pw.length < 12) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 chars)");
  const passwordHash = await bcrypt.hash(pw, 12);
  // Re-running seed resets this super admin's password to the one in .env (also re-activates the account)
  await db.admin.upsert({ where: { email }, update: { passwordHash, role: "SUPER", active: true }, create: { name: "Super Admin", email, role: "SUPER", passwordHash } });
  for (const p of Object.values(Platform)) await db.rate.upsert({ where: { platform: p }, update: {}, create: { platform: p, perMillion: 800 } }); // Rs 800 / million views
  await db.setting.upsert({ where: { key: "AGENT_PER_BLOGGER" }, update: {}, create: { key: "AGENT_PER_BLOGGER", value: "200" } });           // Rs 200 per blogger added
  console.log("Seeded admin, rates (800/million) and agent bonus (200/blogger)");
}
main().finally(() => db.$disconnect());
