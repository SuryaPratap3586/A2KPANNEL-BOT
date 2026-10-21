import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuper } from "@/lib/auth";
// CSV-injection safe cell escaping
const esc = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
export async function GET(req: Request) {
  try { await requireSuper(); } catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
  const type = new URL(req.url).searchParams.get("type");
  let rows: string[][] = [];
  if (type === "videos") {
    const v = await db.video.findMany({ include: { blogger: true }, orderBy: { createdAt: "desc" } });
    rows = [["id","blogger","platform","url","status","views","earnings"], ...v.map(x => [x.id, x.blogger.name, x.platform, x.url, x.status, String(x.views), String(x.earnings)])];
  } else if (type === "payments" || type === "withdrawals") {
    const w = await db.withdrawal.findMany({ include: { blogger: true, agent: true }, orderBy: { createdAt: "desc" } });
    rows = [["id","role","name","amount","status","note","date"], ...w.map(x => [x.id, x.blogger ? "blogger" : "agent", x.blogger?.name ?? x.agent?.name ?? "", String(x.amount), x.status, x.note ?? "", x.createdAt.toISOString()])];
  } else return NextResponse.json({ error: "bad type" }, { status: 400 });
  return new NextResponse(rows.map(r => r.map(esc).join(",")).join("\n"), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename=${type}.csv` } });
}
