# A2K – Telegram Social Media Promotion Platform

Flow: **Admin → Agent bot → (one-time link) → Blogger bot → Admin moderation → Views/Earnings → Payment (agents + bloggers)**

## Money rules (all editable in the admin panel)
| Who | Earns | Where to edit |
|---|---|---|
| Agent | ₹200 for every blogger who joins through the agent's link | Admin → Rates & bonus (default for new bloggers) / Admin → Bloggers (one blogger) |
| Blogger | ₹800 per 1,000,000 views (per platform) | Admin → Rates & bonus |
| Both | Manual + / − adjustment with a reason | Admin → Agents / Bloggers → "Adjust" |

- Admin can edit any approved video's views (up or down); earnings follow the rate at that moment, past earnings never change when the rate changes.
- Payments: Admin → Payments. Statuses **Pending → In progress → Complete**, or **Reject** (reason required, money returns to balance). User gets a Telegram message on every change.

## Admin roles
| | Super admin | Admin |
|---|---|---|
| Videos: open every blogger's link, approve / reject (reason: pick or write), fetch views (auto button) or type views (manual) | ✅ | ✅ |
| Own password change | ✅ | ✅ |
| Dashboard, agents, bloggers, accounts, payments, rates, audit logs | ✅ | ❌ |
| Team: create admins, reset passwords, deactivate, give / take super access | ✅ | ❌ |
| Work report per admin (approved, rejected, auto fetches, manual edits, views added; 7 days / 30 days / all time) | ✅ (Dashboard) | ❌ |

- The first account from `npm run db:seed` is the Super admin. Create more admins in **Team**.
- Hand over super access: Team → "Make super admin" for the new person, then "Remove super access" for yourself. At least one active super admin always remains.
- Permissions are checked against the database on every page and action, so deactivating or demoting someone works immediately, even if they are still logged in.
- Passwords: minimum 12 characters, bcrypt.

## Weekly cycle (IST)
- Links can be submitted **Monday to Friday**. Views are tracked until **Saturday 11:59 PM** of the submission week, then frozen.
- Cron: call `GET /api/cron/fetch-views` (header `Authorization: Bearer $CRON_SECRET`) **every night at 23:59 IST**. Each run saves that day's views / likes / comments (the 7-day day-wise table), the Saturday run is the final fetch. The same call deletes day-wise stats and repost records older than **14 days** (videos and earnings are kept, balances never change).
- **Live views** = fetched from the platform. **Payable views** = what the blogger sees and is paid on. Admin can type payable views on Videos; after that, fetch updates only the live numbers (button **Use live** goes back). In the app the blogger sees payable views, and the **Live views** button shows the actual ones.

## Account check
A blogger can only submit videos of his **approved linked accounts**. YouTube: channel (`@handle` or `/channel/UC…`) is compared through the YouTube API. Instagram / Facebook: the owner is read from the link or from the data provider. A video from another account is rejected with "Account not linked". If the owner cannot be read, the video is accepted as **⚠ unverified** for admin (set `STRICT_OWNER_CHECK="true"` to reject instead). A duplicate link is saved as a **repost** (shown in the app and in Admin → Videos → Reposts). Bloggers can also paste a link in the blogger bot.

## APIs
- **YouTube:** official Data API v3 (views, likes, comments, channel).
- **Instagram / Facebook:** no official public-view API for other people's reels, so Apify actors are used (`APIFY_TOKEN`); check each actor's price and output on apify.com, change `APIFY_*_ACTOR` / `APIFY_*_INPUT` if you pick another one.

## Bots
- **Agent bot:** `/start` → token login → buttons **My Profile · Add Blogger · Language · Open App**.
- **Blogger bot:** `/start` alone registers the blogger (with an agent link the agent is assigned and earns the bonus). Buttons **Open App · Language**. Everything else is inside the Mini App.
- **Open App (Telegram Web App, `/app`):** Home, Videos (submit + status + views + earnings), Accounts / Bloggers (+ create blogger link for agents), Payments (payment details, request payment, history), Settings (English / हिंदी).

## Supported video links (checked Oct 2026)
- **YouTube:** `watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/` → saved as one canonical link (same video can't be submitted twice).
- **Instagram:** `/reel/`, `/reels/`, `/p/`, `/tv/`, `/<user>/reel/`, new `/share/…` links; tracking params removed.
- **Facebook:** `/reel/ID`, `/share/r|v|p/…`, `/watch/?v=`, `/…/videos/ID`, `fb.watch/…`.
- Also ShareChat, Moj, TikTok, Other (https + domain check).
- All three now count a view when playback starts (YouTube: Shorts since 31 Mar 2025, all formats from 24 Aug 2026 per reports; Instagram: "Views" replaced Plays/Impressions in Apr 2025; Facebook Page Insights dropped Impressions in Nov 2025). Pay is per "views", so numbers are comparable across platforms.
- Auto view fetch: **YouTube** with `YOUTUBE_API_KEY`. Instagram/Facebook don't expose public view counts through an official API without the owner's login, so use a data provider in `src/lib/views.ts` or edit views in Admin → Videos.
- Instagram "repost" feature: reposted videos belong to someone else; reject them in moderation if you don't want them.

## Setup
```bash
cp .env.example .env        # fill values (openssl rand -base64 48 for secrets)
npm install
npm run db:push             # create tables (PostgreSQL)
npm run db:seed             # first admin + rates (800/million) + agent bonus (200)
npm run dev                 # admin panel -> http://localhost:3000/login
npm run bots                # starts both Telegram bots (separate process)
```
1. Create 2 bots in @BotFather; put tokens + blogger bot username in `.env`.
2. Set `WEBAPP_URL=https://YOUR_DOMAIN/app` (HTTPS required) → "Open App" button + chat menu button appear in both bots.
3. Admin → Agents → create agent → copy token (shown once) → agent logs in via Agent bot.
4. Cron (every few hours): `GET /api/cron/fetch-views` with header `Authorization: Bearer $CRON_SECRET`.

## Security built in
- Admin: bcrypt (cost 12), NextAuth JWT (8h), middleware + per-action session check, login rate-limit, audit log (every admin action incl. adjustments and payments).
- Mini App: every request re-verifies Telegram's signed `initData` (HMAC, 24h max age); no cookies, no client trust; per-user rate limit; strict zod validation.
- Agent tokens: only SHA-256 hash stored, shown once, bound to first Telegram ID, token message auto-deleted.
- Links: https + platform allow-list + canonical form; duplicates blocked by DB unique.
- Payment requests: Serializable transaction (no double spend), balance always computed from DB.
- Headers: HSTS, nosniff, frame-ancestors none (Telegram only for `/app`). CSV export is formula-injection safe.

## Notes
- Rate limiters are in-memory (one server instance). Use Redis if you scale out.
- Payout itself is manual: admin pays outside, then marks **Complete**.
- Add admin 2FA and a nonce-based CSP before going big.
