import { Platform } from "@prisma/client";

const HOSTS: Record<Platform, string[]> = {
  INSTAGRAM: ["instagram.com"],
  YOUTUBE: ["youtube.com", "youtu.be"],
  FACEBOOK: ["facebook.com", "fb.watch", "fb.com"],
  SHARECHAT: ["sharechat.com"], MOJ: ["mojapp.in", "moj.app", "mojapp.com"], TIKTOK: ["tiktok.com"], OTHER: [],
};
export const PLATFORMS = Object.keys(HOSTS) as Platform[];
const TRACK = /^(utm_.*|igsh|igshid|fbclid|si|feature|pp|mibextid|rdid|share_url)$/i;
const IG_RESERVED = new Set(["reel", "reels", "p", "tv", "stories", "explore", "accounts", "direct", "about", "share"]);
const FB_RESERVED = new Set(["reel", "reels", "watch", "share", "videos", "groups", "pages", "people", "login", "photo", "hashtag", "marketplace", "events", "stories", "gaming", "help", "permalink.php"]);

function parse(raw: string): URL | null {
  try {
    const t = raw.trim();
    const u = new URL(/^https?:\/\//i.test(t) ? t : "https://" + t);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.protocol = "https:"; u.hash = "";
    return u;
  } catch { return null; }
}
const hostOf = (u: URL) => u.hostname.replace(/^(www|m|web|mbasic|l|music)\./, "").toLowerCase();
const hostOk = (p: Platform, h: string) => !HOSTS[p].length || HOSTS[p].some((x) => h === x || h.endsWith("." + x));

/** Which platform a pasted link belongs to (used when a blogger pastes a link in the bot). */
export function detectPlatform(raw: string): Platform | null {
  const u = parse(raw); if (!u) return null;
  const h = hostOf(u);
  return PLATFORMS.find((p) => p !== "OTHER" && hostOk(p, h)) ?? null;
}

/** Video links -> canonical URL (same video = same string => duplicate protection). */
export function normalizeVideoUrl(platform: Platform, raw: string): string | null {
  const u = parse(raw); if (!u) return null;
  const h = hostOf(u); if (!hostOk(platform, h)) return null;
  const path = u.pathname.replace(/\/+$/, "");

  if (platform === "YOUTUBE") {
    let id: string | null = null;
    if (h === "youtu.be") id = path.split("/")[1] ?? null;
    else if (path === "/watch") id = u.searchParams.get("v");
    else { const m = path.match(/^\/(?:shorts|live|embed)\/([\w-]{11})$/); id = m?.[1] ?? null; }   // Shorts, Live, embed
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  }
  if (platform === "INSTAGRAM") {
    const m = path.match(/^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)$/);
    if (m && m[2] !== "audio") return `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;
    const s = path.match(/^\/share\/(?:(reel|p)\/)?([\w-]+)$/);
    return s ? `https://www.instagram.com/share/${s[1] ? s[1] + "/" : ""}${s[2]}/` : null;
  }
  if (platform === "FACEBOOK") {
    if (h === "fb.watch") return /^\/[\w-]+$/.test(path) ? `https://fb.watch${path}/` : null;
    let m = path.match(/^\/reel\/(\d+)$/); if (m) return `https://www.facebook.com/reel/${m[1]}`;
    m = path.match(/^\/share\/([rvp])\/([\w-]+)$/); if (m) return `https://www.facebook.com/share/${m[1]}/${m[2]}/`;
    if (path === "/watch") { const v = u.searchParams.get("v"); return v && /^\d+$/.test(v) ? `https://www.facebook.com/watch/?v=${v}` : null; }
    m = path.match(/^(?:\/[\w.-]+)?\/videos\/(\d+)$/); if (m) return `https://www.facebook.com${path}`;
    return null;
  }
  for (const k of [...u.searchParams.keys()]) u.searchParams.delete(k);
  return u.toString();
}

/** Some video links already contain the owner (instagram.com/<user>/reel/..., facebook.com/<page>/videos/...). */
export function ownerHint(platform: Platform, raw: string): string | null {
  const u = parse(raw); if (!u) return null;
  const p = u.pathname.replace(/\/+$/, "");
  if (platform === "INSTAGRAM") { const m = p.match(/^\/([\w.]+)\/(?:reel|reels|p|tv)\/[\w-]+$/); return m && !IG_RESERVED.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null; }
  if (platform === "FACEBOOK") { const m = p.match(/^\/([\w.-]+)\/videos\/\d+$/); return m ? m[1].toLowerCase() : null; }
  return null;
}

/** Profile / channel links. `ref` = lowercase username / @handle / channel id; used to check that a video belongs to a linked account. */
export function parseAccount(platform: Platform, raw: string): { url: string; ref: string | null } | null {
  const u = parse(raw); if (!u) return null;
  if (!hostOk(platform, hostOf(u))) return null;
  const segs = u.pathname.split("/").filter(Boolean);

  if (platform === "INSTAGRAM") {
    const s = segs[0]?.toLowerCase();
    if (!s || !/^[a-z0-9._]{1,30}$/.test(s) || IG_RESERVED.has(s)) return null;
    return { url: `https://www.instagram.com/${s}/`, ref: s };
  }
  if (platform === "YOUTUBE") {                                       // only @handle or /channel/UC... links can be verified
    if (/^@[\w.-]{3,}$/.test(segs[0] ?? "")) return { url: `https://www.youtube.com/${segs[0]}`, ref: segs[0].toLowerCase() };
    if (segs[0] === "channel" && /^UC[\w-]{20,}$/.test(segs[1] ?? "")) return { url: `https://www.youtube.com/channel/${segs[1]}`, ref: segs[1].toLowerCase() };
    return null;
  }
  if (platform === "FACEBOOK") {
    if (segs[0] === "profile.php") { const id = u.searchParams.get("id"); return id && /^\d+$/.test(id) ? { url: `https://www.facebook.com/profile.php?id=${id}`, ref: id } : null; }
    if ((segs[0] === "people" || segs[0] === "pages") && /^\d+$/.test(segs[2] ?? "")) return { url: `https://www.facebook.com/${segs[0]}/${segs[1]}/${segs[2]}`, ref: segs[2] };
    const s = segs[0]?.toLowerCase();
    if (!s || !/^[a-z0-9.\-]{3,}$/.test(s) || FB_RESERVED.has(s)) return null;
    return { url: `https://www.facebook.com/${s}`, ref: s };
  }
  for (const k of [...u.searchParams.keys()]) if (TRACK.test(k)) u.searchParams.delete(k);
  if (u.pathname.length < 2) return null;
  return { url: u.toString(), ref: null };
}
