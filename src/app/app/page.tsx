"use client";
import Script from "next/script";
import { useState } from "react";
import { Lang, tr, Key, DICT } from "@/lib/i18n";
<<<<<<< HEAD
import { istDateTime } from "@/lib/week";
import {
  BLOGGER_PLATFORMS,
  accountHasUsername,
  cleanUsername,
  normalizeVideoUrl,
  ownerHint,
} from "@/lib/platforms";
=======
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)

// Bloggers can use these platforms only
const PLATFORMS = BLOGGER_PLATFORMS;
const PNAME: Record<string, string> = {
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  MOJ: "Moj",
  FACEBOOK: "Facebook",
};
type T = (k: Key, v?: Record<string, string | number>) => string;

/** Video submission: platform + username (@xyz) + video link are all required and checked while typing
 *  (same rules as the server). Submit is enabled only when everything is correct. */
function SubmitVideo({
  d,
  t,
  act,
  inp,
  btn,
}: {
  d: any;
  t: T;
  act: (body: Record<string, unknown>, ok?: Key) => Promise<boolean>;
  inp: React.CSSProperties;
  btn: React.CSSProperties;
}) {
  const [platform, setPlatform] = useState("");
  const [user, setUser] = useState("");
  const [url, setUrl] = useState("");
  const approved = d.accounts.filter(
    (a: any) => a.status === "APPROVED" && a.platform === platform,
  );
  const hasAccount = !platform || approved.length > 0;
  const clean = cleanUsername(user);
  const userOk =
    !!clean && approved.some((a: any) => accountHasUsername(a, clean));
  const canon = platform ? normalizeVideoUrl(platform as any, url) : null;
  const owner = canon ? ownerHint(platform as any, url) : null;
  const linkOk = !!canon && (!owner || !clean || owner === clean);
  const ready = d.submitOpen && !!platform && hasAccount && userOk && linkOk;
  const hint = (s: string) => (
    <div style={{ fontSize: 12, color: "#c53030", margin: "-2px 0 6px" }}>
      {s}
    </div>
  );
  return (
    <>
      <select
        style={inp}
        value={platform}
        onChange={(e) => setPlatform(e.target.value)}
        required
      >
        <option value="" disabled>
          {t("choosePlatform")} *
        </option>
        {PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {PNAME[p]}
          </option>
        ))}
      </select>
      {platform && !hasAccount && hint(t("needAccountFor", { p: PNAME[platform] }))}
      <input
        style={inp}
        value={user}
        onChange={(e) => setUser(e.target.value)}
        placeholder={t("usernamePh") + " *"}
        list="myusers"
        autoCapitalize="none"
        autoCorrect="off"
        required
      />
      <datalist id="myusers">
        {approved.map((a: any) => (
          <option key={a.id} value={a.label.startsWith("@") ? a.label : "@" + a.label} />
        ))}
      </datalist>
      {user && !clean && hint(t("e_needUser"))}
      {platform && hasAccount && clean && !userOk && hint(t("e_userNotLinked"))}
      <input
        style={inp}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t("link") + " *"}
        inputMode="url"
        autoCapitalize="none"
        required
      />
      {url && platform && !canon && hint(t("e_badUrl"))}
      {canon && !linkOk && hint(t("e_notLinked"))}
      <button
        style={{ ...btn, opacity: ready ? 1 : 0.45 }}
        disabled={!ready}
        onClick={async () => {
          if (!ready) return;
          const ok = await act(
            { action: "submitVideo", platform, username: user, url },
            "submitted",
          );
          if (ok) setUrl(""); // keep platform + username for the next video
        }}
      >
        {t("submit")}
      </button>
    </>
  );
}
const tr_keys = DICT.EN;
const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("en-IN");
const TONE: Record<string, string> = {
  PENDING: "#b7791f",
  PROCESSING: "#2b6cb0",
  PAID: "#2f855a",
  APPROVED: "#2f855a",
  REJECTED: "#c53030",
};

// Telegram Mini App ("Open App"): everything for Agent and Blogger lives here.
export default function MiniApp() {
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState("home");
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const lang: Lang = d?.lang ?? "EN";
  const t = (k: Key, v?: Record<string, string | number>) => tr(lang, k, v);

  async function call(body: Record<string, unknown>) {
    const tg = (window as any).Telegram?.WebApp;
    const r = await fetch("/api/webapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData: tg?.initData ?? "", ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403 && j.error === "access denied") {
      setErr(
        "⛔ Access denied. This Telegram account is registered as an agent.",
      );
      return false;
    }
    if (r.status === 401 || r.status === 403) {
      setErr("Open this page from the Telegram bot (Open App button).");
      return false;
    }
    if (!r.ok) {
      setMsg(
        "❌ " + tr(lang, (j.error as Key) in tr_keys ? j.error : "e_failed"),
      );
      return false;
    }
    setD(j.data);
    if (j.link) setLink(j.link.url);
    return true;
  }
  const act = async (body: Record<string, unknown>, ok: Key = "done") => {
    setMsg("");
    const good = await call(body);
    if (good) setMsg("✅ " + t(ok));
    return good;
  };
  const boot = () => {
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    call({ action: "me" });
  };

  const isB = d?.role === "blogger";
  const tabs = isB
    ? ["home", "videos", "accounts", "payments", "settings"]
    : ["home", "videos", "bloggers", "payments", "settings"];
  const box: React.CSSProperties = {
    background: "var(--tg-theme-secondary-bg-color,#f1f3f5)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  };
  const inp: React.CSSProperties = {
    width: "100%",
    padding: 8,
    borderRadius: 8,
    border: "1px solid #cbd5e0",
    marginBottom: 6,
    background: "#fff",
    color: "#111",
  };
  const btn: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 8,
    border: 0,
    background: "var(--tg-theme-button-color,#2b6cb0)",
    color: "var(--tg-theme-button-text-color,#fff)",
    fontWeight: 600,
  };
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
      }}
    >
      <span style={{ opacity: 0.7 }}>{k}</span>
      <b>{v}</b>
    </div>
  );
  const Tag = ({ s, label }: { s: string; label: string }) => (
    <span style={{ color: TONE[s], fontWeight: 600, fontSize: 12 }}>
      {label}
    </span>
  );
  const Empty = () => <p style={{ opacity: 0.6 }}>{t("noData")}</p>;
  // Link given by the admin: the blogger must add it to his social media account
  const LinkCard = () =>
    d.assignedLink ? (
      <div style={{ ...box, border: "1px solid #f2b705" }}>
        <b>🔗 {t("addLinkTitle")}</b>
        <div style={{ wordBreak: "break-all", margin: "6px 0" }}>
          {d.assignedLink}
        </div>
        <button
          style={btn}
          onClick={() => {
            navigator.clipboard?.writeText(d.assignedLink);
            setMsg("✅ " + t("copied"));
          }}
        >
          {t("copy")}
        </button>
      </div>
    ) : null;

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: 12,
        paddingBottom: 80,
        background: "var(--tg-theme-bg-color,#fff)",
        color: "var(--tg-theme-text-color,#111)",
        minHeight: "100vh",
        fontFamily: "system-ui,sans-serif",
      }}
    >
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        onReady={boot}
      />
      {err && <p style={{ color: "#c53030" }}>{err}</p>}
      {d && (
        <>
          <div style={{ ...box, background: "#14213d", color: "#fff" }}>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              {t(isB ? "role_blogger" : "role_agent")}
            </div>
            <div style={{ fontWeight: 700 }}>{d.name}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f2b705" }}>
              {inr(d.balance)}
            </div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>{t("balance")}</div>
          </div>
          {msg && <p>{msg}</p>}

          {tab === "home" && isB && <LinkCard />}
          {tab === "home" && (
            <div style={box}>
              {isB ? (
                <>
                  <Row k={t("totalViews")} v={num(d.views)} />
                  <Row k={t("pending")} v={d.counts.pending} />
                  <Row k={t("approved")} v={d.counts.approved} />
                  <Row k={t("rejected")} v={d.counts.rejected} />
                  <Row k={t("yourAgent")} v={d.agent ?? t("noAgent")} />
                  <p style={{ opacity: 0.7, fontSize: 12 }}>
                    {t("closedNote")}
                  </p>
                </>
              ) : (
                <>
                  <Row k={t("bloggers")} v={d.bloggers.length} />
                  <Row k={t("earnings")} v={inr(d.earnings)} />
                  <p style={{ opacity: 0.7, fontSize: 12 }}>
                    {t("perBlogger", { bonus: d.bonus })}
                  </p>
                </>
              )}
            </div>
          )}

          {tab === "videos" && (
            <>
              {isB && (
                <div style={box}>
                  <p style={{ margin: "0 0 6px", fontSize: 12, opacity: 0.7 }}>
                    {d.submitOpen ? t("closedNote") : "🔒 " + t("e_closed")}
                  </p>
                  {d.accounts.some((a: any) => a.status === "APPROVED") ? (
                    <SubmitVideo d={d} t={t} act={act} inp={inp} btn={btn} />
                  ) : (
                    <p style={{ margin: 0 }}>{t("e_needAccount")}</p>
                  )}
                </div>
              )}
              {d.videos.length ? (
                d.videos.map((v: any) => (
                  <div key={v.id} style={box}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <b>
                        {v.platform}
                        {v.blogger ? " · " + v.blogger : ""}
                      </b>
                      <Tag s={v.status} label={t(("st_" + v.status) as Key)} />
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        wordBreak: "break-all",
                        opacity: 0.7,
                      }}
                    >
                      {v.url}
                    </div>
<<<<<<< HEAD
<<<<<<< HEAD
                    {/* Timeline: submission, approval, 168-hour tracking window (IST) */}
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      <div>
                        <b style={{ color: TONE[v.state] }}>
                          {t(("ts_" + v.state) as Key)}
                        </b>
                        {v.state === "TRACKING"
                          ? " · " + t("dayOf", { d: v.day })
=======
                    {isB && (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {t("submittedOn", { d: v.submittedAt })}
                        {v.approvedAt
                          ? " · " + t("approvedOn", { d: v.approvedAt })
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
                          : ""}
                      </div>
                    )}
                    {v.status === "APPROVED" && isB && (
                      <div style={{ fontSize: 13, opacity: 0.8 }}>
                        {v.done ? t("sevenDone") : t("dayOf", { d: v.day })}
                      </div>
<<<<<<< HEAD
                      {v.approvedAt && (
                        <div>
                          {t("approvedOn", { d: istDateTime(v.approvedAt) })}
                        </div>
                      )}
                      {v.trackStart && (
                        <div>
                          {t("trackStartOn", { d: istDateTime(v.trackStart) })}
                        </div>
                      )}
                      {v.trackEnd && (
                        <div>
                          {t("trackEndOn", { d: istDateTime(v.trackEnd) })}
                        </div>
                      )}
                    </div>
=======
>>>>>>> parent of 34ba41d (Track each video for its own 7 days and harden payments)
                    {v.status === "APPROVED" && !isB && (
                      <div style={{ fontSize: 13, marginTop: 4 }}>
                        {v.state === "COMPLETED" ? (
                          <>
                            {t("eligibleViews")}:{" "}
                            <b>{num(v.eligibleViews ?? 0)}</b> · {t("payment")}
                            : <b>{inr(v.payment ?? 0)}</b>
                          </>
                        ) : (
                          t("notFinal", { d: istDateTime(v.trackEnd) })
                        )}
=======
                    )}
                    {v.status === "APPROVED" && !isB && (
                      <div style={{ fontSize: 13 }}>
                        {t("payViews")}: {num(v.views)}
>>>>>>> parent of 20922ca (Add 168-hour tracking timelines, broadcast, Facebook links and faster admin)
                      </div>
                    )}
                    {v.reason && (
                      <div style={{ fontSize: 13, color: "#c53030" }}>
                        {v.reason}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <Empty />
              )}
              {isB && d.reposts.length > 0 && (
                <div style={box}>
                  <b>{t("reposts")}</b>
                  {d.reposts.map((r: any) => (
                    <div
                      key={r.id}
                      style={{
                        fontSize: 12,
                        wordBreak: "break-all",
                        opacity: 0.8,
                        paddingTop: 4,
                      }}
                    >
                      {r.date} · {r.url}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "accounts" && isB && (
            <>
              <LinkCard />
              <div style={box}>
                <select id="ap" style={inp}>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PNAME[p]}
                    </option>
                  ))}
                </select>
                <input
                  id="au"
                  style={inp}
                  placeholder={t("link")}
                  inputMode="url"
                />
                <button
                  style={btn}
                  onClick={() => {
                    const u = document.getElementById("au") as HTMLInputElement;
                    act({
                      action: "addAccount",
                      platform: (
                        document.getElementById("ap") as HTMLSelectElement
                      ).value,
                      url: u.value,
                    });
                    u.value = "";
                  }}
                >
                  {t("add")}
                </button>
              </div>
              {d.accounts.length ? (
                d.accounts.map((a: any) => (
                  <div key={a.id} style={box}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <b>
                        {a.platform} · {a.label}
                      </b>
                      <Tag s={a.status} label={t(("st_" + a.status) as Key)} />
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        wordBreak: "break-all",
                        opacity: 0.7,
                      }}
                    >
                      {a.url}
                    </div>
                    {a.status === "REJECTED" && a.reason && (
                      <div
                        style={{ fontSize: 13, color: "#c53030", marginTop: 4 }}
                      >
                        {a.reason}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <Empty />
              )}
            </>
          )}

          {tab === "bloggers" && !isB && (
            <>
              <div style={box}>
                <p style={{ marginTop: 0 }}>
                  {t("perBlogger", { bonus: d.bonus })}
                </p>
                <button style={btn} onClick={() => act({ action: "newLink" })}>
                  {t("newLink")}
                </button>
                {link && (
                  <p style={{ wordBreak: "break-all" }}>
                    {link}
                    <br />
                    <button
                      style={{ ...btn, marginTop: 6 }}
                      onClick={() => {
                        navigator.clipboard?.writeText(link);
                        setMsg("✅ " + t("copied"));
                      }}
                    >
                      {t("copy")}
                    </button>
                  </p>
                )}
              </div>
              {d.bloggers.length ? (
                d.bloggers.map((b: any) => (
                  <div key={b.id} style={box}>
                    <Row
                      k={b.name}
                      v={b.credited ? inr(b.bonus) : t("pending")}
                    />
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {t("videos")}: {b.videos}
                    </div>
                  </div>
                ))
              ) : (
                <Empty />
              )}
            </>
          )}

          {tab === "payments" && (
            <>
              <div style={box}>
                <input
                  id="pd"
                  style={inp}
                  defaultValue={d.payDetails}
                  placeholder={t("payDetails")}
                />
                <button
                  style={btn}
                  onClick={() =>
                    act(
                      {
                        action: "setPay",
                        details: (
                          document.getElementById("pd") as HTMLInputElement
                        ).value,
                      },
                      "saved",
                    )
                  }
                >
                  {t("save")}
                </button>
              </div>
              <div style={box}>
                <input
                  id="am"
                  style={inp}
                  type="number"
                  inputMode="decimal"
                  placeholder={t("amount")}
                />
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  {t("minWithdraw", { min: d.minWithdraw })}
                </div>
                <button
                  style={btn}
                  onClick={() =>
                    act({
                      action: "withdraw",
                      amount: (
                        document.getElementById("am") as HTMLInputElement
                      ).value,
                    })
                  }
                >
                  {t("withdraw")}
                </button>
              </div>
              {d.payments.length ? (
                d.payments.map((p: any) => (
                  <div key={p.id} style={box}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <b>{inr(p.amount)}</b>
                      <Tag s={p.status} label={t(("s_" + p.status) as Key)} />
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {p.date}
                      {p.note ? " · " + p.note : ""}
                    </div>
                  </div>
                ))
              ) : (
                <Empty />
              )}
            </>
          )}

          {tab === "settings" && (
            <div style={box}>
              <b>{t("settings")}</b>
              <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
                {(["EN", "HI"] as Lang[]).map((l) => (
                  <button
                    key={l}
                    style={{ ...btn, opacity: lang === l ? 1 : 0.5 }}
                    onClick={() => act({ action: "setLang", lang: l }, "saved")}
                  >
                    {l === "EN" ? "English" : "हिंदी"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <nav
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              display: "flex",
              background: "var(--tg-theme-secondary-bg-color,#f1f3f5)",
              borderTop: "1px solid #cbd5e0",
              paddingBottom: "env(safe-area-inset-bottom,0px)",
            }}
          >
            {tabs.map((x) => (
              <button
                key={x}
                onClick={() => {
                  setTab(x);
                  setMsg("");
                  call({ action: "me" });
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  border: 0,
                  background: "none",
                  fontWeight: tab === x ? 700 : 400,
                  color: tab === x ? "#2b6cb0" : "inherit",
                  fontSize: 12,
                }}
              >
                {t(x as Key)}
              </button>
            ))}
          </nav>
        </>
      )}
    </main>
  );
}
