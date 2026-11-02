import Link from "next/link";
import { pageStaff } from "@/lib/auth";
import SignOut from "./SignOut";
import MobileMenu from "./MobileMenu";
const SUPER_NAV = [
  ["Dashboard", "/admin"],
  ["Agents", "/admin/agents"],
  ["Agent weekly", "/admin/agent-weekly"],
  ["Bloggers", "/admin/bloggers"],
  ["Social accounts", "/admin/accounts"],
  ["Videos", "/admin/videos"],
  ["Payments", "/admin/payments"],
  ["Rates & bonus", "/admin/rates"],
  ["Team (admins)", "/admin/team"],
  ["Audit logs", "/admin/audit"],
  ["My account", "/admin/account"],
];
const ADMIN_NAV = [
  ["Videos", "/admin/videos"],
  ["My account", "/admin/account"],
];
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await pageStaff(); // DB-checked: deactivated admins are kicked out immediately
  const nav = me.role === "SUPER" ? SUPER_NAV : ADMIN_NAV;
  const links = nav.map(([l, h]) => (
    <Link
      key={h}
      href={h}
      className="block px-2 py-1.5 rounded hover:bg-slate-700 text-sm"
    >
      {l}
    </Link>
  ));
  const who = (
    <>
      <div className="pt-6 text-xs text-slate-400 break-all">{me.email}</div>
      <SignOut />
    </>
  );
  return (
    <div className="md:flex min-h-screen">
      {/* desktop: sidebar; phone: top bar with a menu that opens */}
      <aside className="bg-slate-900 text-slate-200 md:w-52 md:shrink-0">
        <MobileMenu label="Menu">
          {links}
          {who}
        </MobileMenu>
        <div className="hidden md:block p-4 space-y-1">
          <div className="font-bold text-lg text-amber-400">A2K Admin</div>
          <div className="text-xs text-slate-400 mb-3">
            {me.role === "SUPER" ? "Super admin" : "Admin"} · {me.name}
          </div>
          {links}
          {who}
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-auto p-3 md:p-6 space-y-4">{children}</main>
    </div>
  );
}
