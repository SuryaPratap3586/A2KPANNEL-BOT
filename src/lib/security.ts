import crypto from "crypto";

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");

/** Simple in-memory fixed-window limiter (use Redis if you run multiple instances). */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private max: number, private windowMs: number) {}
  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.reset < now) { this.hits.set(key, { n: 1, reset: now + this.windowMs }); return true; }
    h.n++;
    return h.n <= this.max;
  }
}

/** Validates Telegram Web App initData (HMAC) and returns the Telegram user or null. */
export function verifyWebAppInitData(initData: string, botToken: string, maxAgeSec = 3600) {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const data = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(data).digest("hex");
  const a = Buffer.from(calc), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const auth = Number(p.get("auth_date"));
  if (!auth || Date.now() / 1000 - auth > maxAgeSec) return null;
  try { return JSON.parse(p.get("user") || "") as { id: number; first_name: string; username?: string }; } catch { return null; }
}
