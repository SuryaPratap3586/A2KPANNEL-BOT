"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
export default function Login() {
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await signIn("credentials", { email: f.get("email"), password: f.get("password"), redirect: false });
    if (r?.ok) window.location.href = "/admin"; else setErr("Invalid credentials or too many attempts.");
  }
  return (
    <main className="min-h-screen grid place-items-center">
      <form onSubmit={submit} className="card w-80 space-y-3">
        <h1 className="text-lg font-semibold">A2K Admin Login</h1>
        <input name="email" type="email" required placeholder="Email" className="inp w-full" autoComplete="username" />
        <input name="password" type="password" required placeholder="Password" className="inp w-full" autoComplete="current-password" />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button className="btn w-full">Sign in</button>
      </form>
    </main>
  );
}
