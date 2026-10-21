import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Routing convenience only. Real permission checks happen in requireStaff/requireSuper (DB-checked) on every page and action.
const STAFF_OK = ["/admin/videos", "/admin/account"];
export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token as any)?.role;
    const p = req.nextUrl.pathname;
    if (role !== "SUPER" && !STAFF_OK.some((x) => p === x || p.startsWith(x + "/")))
      return NextResponse.redirect(new URL("/admin/videos", req.url));
  },
  { pages: { signIn: "/login" }, callbacks: { authorized: ({ token }) => !!token } }
);
export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
