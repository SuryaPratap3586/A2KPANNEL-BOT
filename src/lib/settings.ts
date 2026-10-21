import { Prisma } from "@prisma/client";
import { db } from "./db";
export async function getAgentBonus(c: Prisma.TransactionClient = db): Promise<number> {
  const s = await c.setting.findUnique({ where: { key: "AGENT_PER_BLOGGER" } });
  return s ? Number(s.value) : 200;
}
export const MIN_WITHDRAW = () => Number(process.env.MIN_WITHDRAW ?? 100);
