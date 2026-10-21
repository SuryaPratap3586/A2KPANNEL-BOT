import { pageStaff } from "@/lib/auth";
import { changeOwnPassword } from "../actions";
export const dynamic = "force-dynamic";
export default async function Account({ searchParams }: { searchParams: { msg?: string } }) {
  const me = await pageStaff();
  return (<><h1 className="text-xl font-semibold">My account</h1>
    <div className="card text-sm">{me.name} · {me.email} · {me.role === "SUPER" ? "Super admin" : "Admin"}</div>
    {searchParams.msg && <p className="card text-sm">{searchParams.msg}</p>}
    <form action={changeOwnPassword} className="card space-y-2 max-w-sm"><h2 className="font-medium">Change password</h2>
      <input name="current" type="password" required placeholder="Current password" className="inp w-full" autoComplete="current-password" />
      <input name="next" type="password" required minLength={12} placeholder="New password (min 12 characters)" className="inp w-full" autoComplete="new-password" />
      <button className="btn">Change password</button></form></>);
}
