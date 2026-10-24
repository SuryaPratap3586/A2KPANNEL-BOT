import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const c = new PrismaClient();
  // A dropped database connection (idle pooler, sleeping Neon database) makes the first query after a pause fail once.
  // Such errors are retried up to 2 times (never inside a transaction), so the user gets an answer instead of silence.
  const RETRY = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
  c.$use(async (params, next) => {
    for (let i = 0; ; i++) {
      try {
        return await next(params);
      } catch (e: any) {
        const retry =
          !params.runInTransaction &&
          i < 2 &&
          (RETRY.has(e?.code) ||
            /Closed|terminating connection|ECONNRESET/i.test(
              String(e?.message),
            ));
        if (!retry) throw e;
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
  });
  return c;
}

export const db = g.prisma ?? create();
if (process.env.NODE_ENV !== "production") g.prisma = db;
