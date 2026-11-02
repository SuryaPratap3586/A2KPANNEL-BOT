import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { createAdmin, resetAdminPassword, setAdminActive, setAdminRole } from "../actions";
export const dynamic = "force-dynamic";

// Super admin: create admins, give / take super access, deactivate, reset passwords.
export default async function Team({ searchParams }: { searchParams: { msg?: string } }) {
  const me = await pageSuper();
  const admins = await db.admin.findMany({ orderBy: { createdAt: "asc" } });
  return (<><h1 className="text-xl font-semibold">Team (admins)</h1>
    {searchParams.msg && <p className="card text-sm">{searchParams.msg}</p>}
    <form action={createAdmin} className="card flex flex-wrap gap-2 items-end"><div className="w-full font-medium">Add admin (video moderation only)</div>
      <input name="name" required minLength={2} placeholder="Name" className="inp" />
      <input name="email" type="email" required placeholder="Login email" className="inp" />
      <input name="password" type="password" required minLength={12} placeholder="Password (min 12)" className="inp" autoComplete="new-password" />
      <button className="btn">Create admin</button></form>
    <div className="card"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Super access</th><th>Login</th><th>Reset password</th></tr></thead><tbody>
      {admins.map((a) => <tr key={a.id}><td>{a.name}{a.id === me.id ? " (you)" : ""}<div className="text-xs text-slate-500">{a.email}</div></td>
        <td>{a.role === "SUPER" ? "Super admin" : "Admin"}</td><td>{a.active ? "Active" : "Deactivated"}</td>
        <td><form action={setAdminRole}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="role" value={a.role === "SUPER" ? "ADMIN" : "SUPER"} /><button className={a.role === "SUPER" ? "btn-r" : "btn-g"}>{a.role === "SUPER" ? "Remove super access" : "Make super admin"}</button></form></td>
        <td><form action={setAdminActive}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={String(!a.active)} /><button className={a.active ? "btn-r" : "btn-g"}>{a.active ? "Deactivate" : "Activate"}</button></form></td>
        <td><form action={resetAdminPassword} className="flex gap-1"><input type="hidden" name="id" value={a.id} /><input name="password" type="password" required minLength={12} placeholder="New password" className="inp w-36" autoComplete="new-password" /><button className="btn">Reset</button></form></td></tr>)}
    </tbody></table>
    <p className="text-xs text-slate-500 mt-2">To hand over super access: make the other person Super admin, then remove your own. At least one active super admin must always remain.</p></div></>);
}
