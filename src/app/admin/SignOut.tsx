"use client";
import { signOut } from "next-auth/react";
export default function SignOut() { return <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs underline">Sign out</button>; }
