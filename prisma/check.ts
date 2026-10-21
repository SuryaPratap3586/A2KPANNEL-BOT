import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD ?? "";
  console.log("ADMIN_EMAIL in .env :", email ?? "(missing)");
  console.log("ADMIN_PASSWORD length:", pw.length, pw.length < 12 ? "(too short, min 12)" : "");
  console.log("email format valid   :", /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? ""));
  const all = await db.admin.findMany({ select: { email: true, role: true, active: true, passwordHash: true } });
  console.log("admins in database   :", all.length);
  for (const a of all) console.log(" -", a.email, a.role, "active=" + a.active, "| .env password matches:", await bcrypt.compare(pw, a.passwordHash));
  if (!all.length) console.log("=> No admin found. Run: npm run db:seed");
  else if (!all.some((a) => a.email === email)) console.log("=> ADMIN_EMAIL does not match any admin above. Use one of those emails, or run: npm run db:seed");
}
main().catch((e) => console.error("DB ERROR:", e.message)).finally(() => db.$disconnect());
