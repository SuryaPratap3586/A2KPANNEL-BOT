import { db } from "@/lib/db";
import { pageSuper } from "@/lib/auth";
import { reviewAccount } from "../actions";
import PlanBadge from "../PlanBadge";
export const dynamic = "force-dynamic";

function Review({ id, status }: { id: string; status: string }) {
  return (
    <span className="flex gap-1">
      {(["APPROVED", "REJECTED"] as const)
        .filter((d) => d !== status)
        .map((d) => (
          <form key={d} action={reviewAccount}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="decision" value={d} />
            <button className={d === "APPROVED" ? "btn-g" : "btn-r"}>
              {d === "APPROVED" ? "Approve" : "Reject"}
            </button>
          </form>
        ))}
    </span>
  );
}
const tone = (s: string) =>
  s === "APPROVED"
    ? "text-green-700"
    : s === "REJECTED"
      ? "text-red-700"
      : "text-amber-700";

export default async function Accounts() {
  await pageSuper();
  const [pending, bloggers] = await Promise.all([
    db.socialAccount.findMany({
      where: { status: "PENDING" },
      include: { blogger: { include: { agent: { include: { plan: true } } } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    db.blogger.findMany({
      where: { accounts: { some: {} }, status: { not: "DELETED" } },
      include: {
        agent: { include: { plan: true } },
        accounts: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return (
    <>
      <h1 className="text-xl font-semibold">Social accounts</h1>
      <div className="card">
        <h2 className="font-medium">
          New accounts waiting for approval ({pending.length})
        </h2>
        <table>
          <thead>
            <tr>
              <th>Blogger</th>
              <th>Agent</th>
              <th>Platform</th>
              <th>Link</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pending.map((a) => (
              <tr key={a.id}>
                <td>{a.blogger.name}</td>
                <td>
                  {a.blogger.agent?.name ?? "—"}{" "}
                  <PlanBadge code={a.blogger.agent?.plan?.code} />
                </td>
                <td>{a.platform}</td>
                <td>
                  <a
                    className="underline break-all"
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {a.url}
                  </a>
                </td>
                <td>{a.createdAt.toISOString().slice(0, 10)}</td>
                <td>
                  <Review id={a.id} status="PENDING" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pending.length && (
          <p className="text-sm text-slate-500 p-2">No pending accounts.</p>
        )}
        <p className="text-xs text-slate-500">
          After you approve or reject, the account stays in the table below.
        </p>
      </div>

      <div className="card">
        <h2 className="font-medium">All bloggers and their accounts</h2>
        <table>
          <thead>
            <tr>
              <th>Blogger</th>
              <th>Agent</th>
              <th>Accounts added</th>
              <th>Last added</th>
              <th>Accounts</th>
            </tr>
          </thead>
          <tbody>
            {bloggers.map((b) => {
              const c = (s: string) =>
                b.accounts.filter((a) => a.status === s).length;
              return (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>
                    {b.agent?.name ?? "—"}{" "}
                    <PlanBadge code={b.agent?.plan?.code} />
                  </td>
                  <td>
                    <b>{b.accounts.length}</b>
                    <div className="text-xs text-slate-500">
                      {c("APPROVED")} approved · {c("PENDING")} pending ·{" "}
                      {c("REJECTED")} rejected
                    </div>
                  </td>
                  <td>{b.accounts[0].createdAt.toISOString().slice(0, 10)}</td>
                  <td>
                    <details>
                      <summary className="btn inline-block cursor-pointer">
                        View all accounts
                      </summary>
                      <table className="mt-2">
                        <thead>
                          <tr>
                            <th>Platform</th>
                            <th>Link</th>
                            <th>Status</th>
                            <th>Added</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {b.accounts.map((a) => (
                            <tr key={a.id}>
                              <td>{a.platform}</td>
                              <td>
                                <a
                                  className="underline break-all"
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer nofollow"
                                >
                                  {a.url}
                                </a>
                              </td>
                              <td className={tone(a.status)}>{a.status}</td>
                              <td>{a.createdAt.toISOString().slice(0, 10)}</td>
                              <td>
                                <Review id={a.id} status={a.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
