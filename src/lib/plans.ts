import { db } from "./db";

/** The two starting plans: D = agent Rs150 / blogger Rs800 per million, S = agent Rs200 / blogger Rs800 per million. Created the first time they are needed. */
const DEFAULTS = [
  { code: "D", name: "Plan D", agentBonus: 150, bloggerPerMillion: 800 },
  { code: "S", name: "Plan S", agentBonus: 200, bloggerPerMillion: 800 },
];
export async function ensurePlans() {
  if ((await db.plan.count()) === 0) {
    for (const p of DEFAULTS) await db.plan.create({ data: p }).catch(() => {}); // parallel page loads: ignore duplicate
  }
  return db.plan.findMany({ orderBy: { code: "asc" } });
}
