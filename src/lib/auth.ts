import { NextAuthOptions, getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { RateLimiter } from "./security";

const limiter = new RateLimiter(5, 15 * 60 * 1000); // 5 attempts / 15 min per email
const DUMMY = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5G1oZpS8Zs0m3mP8qVQ3x5r2m0eQ9yK";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const p = z.object({ email: z.string().email().max(120), password: z.string().min(1).max(200) }).safeParse(creds);
        if (!p.success) return null;
        const email = p.data.email.toLowerCase();
        if (!limiter.allow(email)) return null;
        const admin = await db.admin.findUnique({ where: { email } });
        const ok = await bcrypt.compare(p.data.password, admin?.passwordHash ?? DUMMY);
        const good = ok && !!admin && admin.active;                       // deactivated admins cannot log in
        await db.auditLog.create({ data: { actor: email, action: good ? "LOGIN_OK" : "LOGIN_FAIL" } });
        return good ? ({ id: admin!.id, email: admin!.email, name: admin!.name, role: admin!.role } as any) : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) { if (user) { token.uid = user.id; token.role = (user as any).role; } return token; },
    session({ session, token }) { (session.user as any).id = token.uid; (session.user as any).role = token.role; return session; },
  },
};

export type Staff = { id: string; email: string; name: string; role: "SUPER" | "ADMIN" };

/** Always re-reads the admin from the DB: deactivating or demoting someone takes effect immediately, even with a valid session. */
async function current(): Promise<Staff | null> {
  const s = await getServerSession(authOptions);
  const id = (s?.user as any)?.id as string | undefined;
  if (!id) return null;
  const a = await db.admin.findUnique({ where: { id } });
  return a && a.active ? { id: a.id, email: a.email, name: a.name, role: a.role } : null;
}
export async function requireStaff(): Promise<Staff> { const a = await current(); if (!a) throw new Error("Unauthorized"); return a; }
export async function requireSuper(): Promise<Staff> { const a = await requireStaff(); if (a.role !== "SUPER") throw new Error("Forbidden"); return a; }
// For pages (redirect instead of throwing)
export async function pageStaff(): Promise<Staff> { const a = await current(); if (!a) redirect("/login"); return a; }
export async function pageSuper(): Promise<Staff> { const a = await pageStaff(); if (a.role !== "SUPER") redirect("/admin/videos"); return a; }
