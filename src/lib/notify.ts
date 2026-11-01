/** Fire-and-forget notification (approvals, payments): never blocks or fails the admin action. */
export async function tgSend(botToken: string | undefined, chatId: bigint | number | string, text: string) {
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId.toString(), text }),
  }).catch(() => {});
}

export type TgResult = { ok: true } | { ok: false; code: number; retryAfter?: number; description: string };

/** sendMessage with the real result (used by broadcasts): 429 gives retryAfter seconds, 403 = user blocked the bot. Never contains the token. */
export async function tgMessage(botToken: string, chatId: bigint | number | string, text: string, extra: Record<string, unknown> = {}): Promise<TgResult> {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 15_000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: c.signal,
      body: JSON.stringify({ chat_id: chatId.toString(), text, disable_web_page_preview: true, ...extra }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return { ok: true };
    return { ok: false, code: j.error_code ?? r.status, retryAfter: j.parameters?.retry_after, description: String(j.description ?? r.statusText).slice(0, 200) };
  } catch (e: any) {
    return { ok: false, code: 0, description: e?.name === "AbortError" ? "timeout" : "network error" };
  } finally {
    clearTimeout(t);
  }
}
