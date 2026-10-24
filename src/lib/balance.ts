import { Prisma } from "@prisma/client";
import { db } from "./db";
const n = (d: unknown) => Number(d ?? 0);
const LIVE: ("PENDING" | "PROCESSING" | "PAID")[] = [
  "PENDING",
  "PROCESSING",
  "PAID",
]; // rejected payments return the money

/** Blogger balance = approved-video earnings + admin adjustments - payments (not rejected). */
export async function bloggerBalance(
  id: string,
  c: Prisma.TransactionClient = db,
) {
  const [e, a, w] = await Promise.all([
    c.video.aggregate({
      where: { bloggerId: id, status: "APPROVED" },
      _sum: { earnings: true },
    }),
    c.adjustment.aggregate({
      where: { bloggerId: id },
      _sum: { amount: true },
    }),
    c.withdrawal.aggregate({
      where: { bloggerId: id, status: { in: LIVE } },
      _sum: { amount: true },
    }),
  ]);
  return n(e._sum.earnings) + n(a._sum.amount) - n(w._sum.amount);
}

/** Agent balance = per-blogger bonuses + admin adjustments - payments (not rejected). */
export async function agentBalance(
  id: string,
  c: Prisma.TransactionClient = db,
) {
  const [b, a, w] = await Promise.all([
    c.blogger.aggregate({
      where: {
        agentId: id,
        status: { not: "DELETED" },
        bonusCreditedAt: { not: null },
      },
      _sum: { agentBonus: true },
    }), // only credited bonuses
    c.adjustment.aggregate({ where: { agentId: id }, _sum: { amount: true } }),
    c.withdrawal.aggregate({
      where: { agentId: id, status: { in: LIVE } },
      _sum: { amount: true },
    }),
  ]);
  return n(b._sum.agentBonus) + n(a._sum.amount) - n(w._sum.amount);
}
