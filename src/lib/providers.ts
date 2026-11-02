// Fetches owner + views / likes / comments for ONE video link.
//   YouTube   -> official YouTube Data API v3 (YOUTUBE_API_KEY)
//   Instagram -> RapidAPI (RAPIDAPI_KEY + RAPIDAPI_HOST), else Apify (APIFY_TOKEN)
//   Facebook  -> Apify (APIFY_TOKEN)
// Meta does not give public view counts for other people's reels through an official API, so a data provider is used.
import { Platform } from "@prisma/client";

export type VideoInfo = {
  owners: string[];
  views?: number;
  likes?: number;
  comments?: number;
};
const lc = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase();
const debug = (...a: unknown[]) => {
  if (process.env.PROVIDER_DEBUG === "true") console.log("[provider]", ...a);
}; // never prints keys or tokens

async function http(url: string, init?: RequestInit, ms = 20_000) {
  const c = new AbortController(),
    t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

/** 1234 | "1,234" | "1.2M" | "15K" -> number */
export function parseCount(v: unknown): number | undefined {
  if (typeof v === "number")
    return Number.isFinite(v) ? Math.round(v) : undefined;
  if (typeof v !== "string") return undefined;
  const m = v
    .replace(/,/g, "")
    .trim()
    .match(/^([\d.]+)\s*([kmb])?$/i);
  if (!m) return undefined;
  const mult =
    { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k"] ?? 1;
  const n = parseFloat(m[1]) * mult;
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

async function youtube(url: string): Promise<VideoInfo | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const id = new URL(url).searchParams.get("v");
  if (!id) return null;
  const r = await http(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(id)}&key=${key}`,
  );
  if (!r.ok) return null;
  const it = (await r.json())?.items?.[0];
  if (!it) return null;
  const owners = [lc(it.snippet?.channelId)];
  const cr = await http(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(it.snippet?.channelId ?? "")}&key=${key}`,
  ).catch(() => null);
  const custom: string | undefined =
    cr && cr.ok ? (await cr.json())?.items?.[0]?.snippet?.customUrl : undefined;
  if (custom) owners.push(lc(custom.startsWith("@") ? custom : "@" + custom));
  const st = it.statistics ?? {};
  return {
    owners: owners.filter(Boolean),
    views: parseCount(st.viewCount),
    likes: parseCount(st.likeCount),
    comments: parseCount(st.commentCount),
  };
}

function flat(o: any, p = "", out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flat(v, key, out);
    else out[key] = v;
  }
  return out;
}
function pick(f: Record<string, unknown>, res: RegExp[]) {
  for (const re of res)
    for (const [k, v] of Object.entries(f))
      if (re.test(k)) {
        const n = parseCount(v);
        if (n !== undefined) return n;
      }
}

/** Reads the different field names used by Instagram / Facebook data providers (flat or nested). */
export function mapItem(item: any): VideoInfo {
  const f = flat(item);
  const views = pick(f, [
    /videoPlayCount$/i,
    /(^|\.)video_play_count$/i,
    /(^|\.)ig_play_count$/i,
    /(^|\.)(playCount|plays|play_count)$/i,
    /(^|\.)(viewCount|view_count|viewsCount|videoViewCount|video_view_count)$/i,
    /(^|\.)views$/i,
  ]);
  const likes = pick(f, [
    /(likesCount|likeCount|like_count)$/i,
    /edge_media_preview_like\.count$/i,
    /edge_liked_by\.count$/i,
    /(^|\.)likes$/i,
    /reactionCount$/i,
  ]);
  const comments = pick(f, [
    /(commentsCount|commentCount|comment_count)$/i,
    /edge_media_to_parent_comment\.count$/i,
    /edge_media_to_comment\.count$/i,
    /(^|\.)comments$/i,
  ]);
  const owners = new Set<string>();
  for (const [k, v] of Object.entries(f)) {
    if (typeof v !== "string") continue;
    if (
      !/(^(owner|user)\.username$|^username$|(^|\.)ownerUsername$|(^|\.)ownerProfileUrl$|owner\.url$|author\.(name|url|id|username)$|pageName$|pageUrl$)/i.test(
        k,
      )
    )
      continue;
    owners.add(lc(v));
    try {
      const u = new URL(v);
      const seg = u.pathname.split("/").filter(Boolean)[0];
      if (seg) owners.add(lc(seg));
      const id = u.searchParams.get("id");
      if (id) owners.add(id);
    } catch {}
  }
  return { owners: [...owners].filter(Boolean), views, likes, comments };
}

/** Instagram via RapidAPI. Defaults fit "post by url" style APIs; change RAPIDAPI_PATH / RAPIDAPI_URL_PARAM to match the endpoint you subscribed to. */
async function rapid(
  platform: Platform,
  url: string,
): Promise<VideoInfo | null> {
  const key = process.env.RAPIDAPI_KEY,
    host = process.env.RAPIDAPI_HOST;
  if (!key || !host || platform !== "INSTAGRAM") return null;
  const path = process.env.RAPIDAPI_PATH || "/post";
  const param = process.env.RAPIDAPI_URL_PARAM || "url";
  const r = await http(
    `https://${host}${path}?${param}=${encodeURIComponent(url)}`,
    { headers: { "x-rapidapi-key": key, "x-rapidapi-host": host } },
    25_000,
  );
  debug("rapidapi status", r.status);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const root = j?.data ?? j?.result ?? j;
  const item = Array.isArray(root) ? root[0] : (root?.items?.[0] ?? root);
  if (!item) return null;
  debug("rapidapi fields", Object.keys(flat(item)).slice(0, 80));
  return mapItem(item);
}

async function apify(
  platform: Platform,
  url: string,
): Promise<VideoInfo | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  const ig = platform === "INSTAGRAM";
  const actor =
    (ig
      ? process.env.APIFY_INSTAGRAM_ACTOR
      : process.env.APIFY_FACEBOOK_ACTOR) ||
    (ig ? "apify~instagram-scraper" : "unseenuser~fb-reels");
  const tpl =
    (ig
      ? process.env.APIFY_INSTAGRAM_INPUT
      : process.env.APIFY_FACEBOOK_INPUT) ||
    (ig
      ? '{"directUrls":["{{url}}"],"resultsType":"posts","resultsLimit":1}'
      : '{"startUrls":["{{url}}"]}');
  const input = JSON.parse(tpl.replace(/\{\{url\}\}/g, url));
  const r = await http(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=60&memory=1024`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    },
    75_000,
  );
  debug("apify status", r.status);
  if (!r.ok) return null;
  const items = await r.json();
  return Array.isArray(items) && items.length ? mapItem(items[0]) : null;
}

export async function getVideoInfo(
  platform: Platform,
  url: string,
): Promise<VideoInfo | null> {
  if (platform === "YOUTUBE") return youtube(url);
  if (platform === "INSTAGRAM")
    return (await rapid(platform, url)) ?? apify(platform, url);
  if (platform === "FACEBOOK") return apify(platform, url);
  return null; // ShareChat / Moj / TikTok / Other: admin types views
}
