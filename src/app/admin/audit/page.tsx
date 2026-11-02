import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
export const dynamic = "force-dynamic";

const KEEP_DAYS = 3;

export default async function Audit() {
  await pageSuper();
  // Logs older than 3 days are deleted automatically: every time this page opens, and by the nightly cron.
  await db.auditLog.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } },
  });
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return (
    <>
      <h1 className="text-xl font-semibold">Audit Logs</h1>
      <p className="text-sm text-slate-500">
        Only the last {KEEP_DAYS} days are kept. Older logs are deleted
        automatically.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td>{l.actor}</td>
                <td>{l.action}</td>
                <td>{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!logs.length && <p className="text-sm text-slate-500 p-2">No logs.</p>}
      </div>
    </>
  );
}
