"use client";
import Script from "next/script";
import { useState } from "react";
import { Lang, tr, Key, DICT } from "@/lib/i18n";

const PLATFORMS = [
  "INSTAGRAM",
  "FACEBOOK",
  "YOUTUBE",
  "SHARECHAT",
  "MOJ",
  "TIKTOK",
  "OTHER",
];
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
    if (await call(body)) setMsg("✅ " + t(ok));
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
                    <>
                      <select id="vacc" style={inp}>
                        {d.accounts
                          .filter((a: any) => a.status === "APPROVED")
                          .map((a: any) => (
                            <option key={a.id} value={a.id}>
                              {a.platform} · {a.label}
                            </option>
                          ))}
                      </select>
                      <input
                        id="vu"
                        style={inp}
                        placeholder={t("link")}
                        inputMode="url"
                      />
                      <button
                        style={btn}
                        onClick={() => {
                          const u = document.getElementById(
                            "vu",
                          ) as HTMLInputElement;
                          act(
                            {
                              action: "submitVideo",
                              accountId: (
                                document.getElementById(
                                  "vacc",
                                ) as HTMLSelectElement
                              ).value,
                              url: u.value,
                            },
                            "submitted",
                          );
                          u.value = "";
                        }}
                      >
                        {t("submit")}
                      </button>
                    </>
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
                    {v.status === "APPROVED" && !isB && (
                      <div style={{ fontSize: 13 }}>
                        {t("payViews")}: {num(v.views)}
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
              <div style={box}>
                <select id="ap" style={inp}>
                  {PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
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
                    <Row k={b.name} v={inr(b.bonus)} />
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
