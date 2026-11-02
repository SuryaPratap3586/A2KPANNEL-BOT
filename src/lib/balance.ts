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

/** Balances of many bloggers in 3 queries (list pages), same rules as bloggerBalance. */
export async function bloggerBalances(ids: string[]) {
  const [e, a, w] = await Promise.all([
    db.video.groupBy({
      by: ["bloggerId"],
      where: { bloggerId: { in: ids }, status: "APPROVED", trackEndsAt: { lte: new Date() } },
      _sum: { earnings: true },
    }),
    db.adjustment.groupBy({ by: ["bloggerId"], where: { bloggerId: { in: ids } }, _sum: { amount: true } }),
    db.withdrawal.groupBy({ by: ["bloggerId"], where: { bloggerId: { in: ids }, status: { in: LIVE } }, _sum: { amount: true } }),
  ]);
  const out = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const r of e) out.set(r.bloggerId, (out.get(r.bloggerId) ?? 0) + n(r._sum?.earnings));
  for (const r of a) if (r.bloggerId) out.set(r.bloggerId, (out.get(r.bloggerId) ?? 0) + n(r._sum?.amount));
  for (const r of w) if (r.bloggerId) out.set(r.bloggerId, (out.get(r.bloggerId) ?? 0) - n(r._sum?.amount));
  return out;
}

/** Balances of many agents in 3 queries (list pages), same rules as agentBalance. */
export async function agentBalances(ids: string[]) {
  const [b, a, w] = await Promise.all([
    db.blogger.groupBy({
      by: ["agentId"],
      where: { agentId: { in: ids }, status: { not: "DELETED" }, bonusCreditedAt: { not: null } },
      _sum: { agentBonus: true },
    }),
    db.adjustment.groupBy({ by: ["agentId"], where: { agentId: { in: ids } }, _sum: { amount: true } }),
    db.withdrawal.groupBy({ by: ["agentId"], where: { agentId: { in: ids }, status: { in: LIVE } }, _sum: { amount: true } }),
  ]);
  const out = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const r of b) if (r.agentId) out.set(r.agentId, (out.get(r.agentId) ?? 0) + n(r._sum?.agentBonus));
  for (const r of a) if (r.agentId) out.set(r.agentId, (out.get(r.agentId) ?? 0) + n(r._sum?.amount));
  for (const r of w) if (r.agentId) out.set(r.agentId, (out.get(r.agentId) ?? 0) - n(r._sum?.amount));
  return out;
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
