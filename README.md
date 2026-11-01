# A2K – Telegram Social Media Promotion Platform

Flow: **Admin → Agent bot → (one-time link) → Blogger bot → Admin moderation → Views/Earnings → Payment (agents + bloggers)**

## Money rules (all editable in the admin panel)

| Who     | Earns                                                     | Where to edit                                                                     |
| ------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Agent   | ₹200 for every blogger who joins through the agent's link | Admin → Rates & bonus (default for new bloggers) / Admin → Bloggers (one blogger) |
| Blogger | ₹800 per 1,000,000 views (per platform)                   | Admin → Rates & bonus                                                             |
| Both    | Manual + / − adjustment with a reason                     | Admin → Agents / Bloggers → "Adjust"                                              |

- Admin can edit any approved video's views (up or down); earnings follow the rate at that moment, past earnings never change when the rate changes.
- Payments: Admin → Payments. Statuses **Pending → In progress → Complete**, or **Reject** (reason required, money returns to balance). User gets a Telegram message on every change.

## Admin roles

|                                                                                                                               | Super admin    | Admin |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------- | ----- |
| Videos: open every blogger's link, approve / reject (reason: pick or write), fetch views (auto button) or type views (manual) | ✅             | ✅    |
| Own password change                                                                                                           | ✅             | ✅    |
| Dashboard, agents, bloggers, accounts, payments, rates, audit logs                                                            | ✅             | ❌    |
| Team: create admins, reset passwords, deactivate, give / take super access                                                    | ✅             | ❌    |
| Work report per admin (approved, rejected, auto fetches, manual edits, views added; 7 days / 30 days / all time)              | ✅ (Dashboard) | ❌    |

- The first account from `npm run db:seed` is the Super admin. Create more admins in **Team**.
- Hand over super access: Team → "Make super admin" for the new person, then "Remove super access" for yourself. At least one active super admin always remains.
- Permissions are checked against the database on every page and action, so deactivating or demoting someone works immediately, even if they are still logged in.
- Passwords: minimum 12 characters, bcrypt.

## Tracking rules (each video on its own clock)

- Links can be submitted **Monday to Friday** (Mini App or by pasting the link in the blogger bot; the source is saved as "via app" / "via bot").
- Every video is tracked for **exactly 168 hours from the moment an admin approves it** (approved Monday 10:30 → completes next Monday 10:30; approved Tuesday 16:05 → next Tuesday 16:05).
- Status: **Pending Approval → Tracking in Progress → 7 Days Completed** (or Rejected). Completion is automatic (it depends only on the clock).
- Only completed videos count: their **eligible views** and **payment** enter the balance. Videos still tracking never enter a balance or a payment request.
- Admin Panel (Videos) and the Mini App show for every video: submission time, approval time, tracking start, tracking end, status, eligible views and payment (payment for agents and admins).
- **Actual views are fetched twice per video:** (1) **starting views** right after approval (Approve button; retried by the cron for 6 hours if it failed), (2) **final views** at the first hourly cron run after its 168 hours end; then the video is frozen. The Videos page shows them as **Actual views** (starting, final, gained = final - starting). Fetched views are information only: **they never create a payment.**
- Cron: call `GET /api/cron/fetch-views` (header `Authorization: Bearer $CRON_SECRET`) **every hour**, so each final fetch happens within an hour of the end. If the final fetch fails for 24 hours the video is frozen and the admin types the views. The same call deletes day-wise stats and repost records older than **14 days** and audit logs older than 3 days (videos and earnings are kept, balances never change).
- **Payable views (the only source of payment):** after the 168 hours the admin enters the payable views on Videos → Completed (the field is pre-filled with the gained views; nothing is paid until **Save**). Payment = payable views / 1,000,000 x rate. Payable views cannot be entered while a video is still tracking. They can be changed later; only the difference is added or removed (no double counting). Until they are entered the video shows "not entered yet: no payment" (and in the agent app "Payable views not entered by admin yet").
- **Actual views** = fetched from the platform. **Payable views** = entered by the admin, what the blogger is paid on.
- Moving an existing database to the 168-hour rule: `npm run db:retrack` (changes only videos that are still tracking; completed videos and paid money are not touched).

## Broadcast

- Admin → **Broadcast** (super admin only): write a message, pick **All bloggers and agents / All bloggers / All agents / Bloggers of one agent**, the number of recipients is shown, confirm, send.
- Bloggers get it from the blogger bot, agents from the agent bot (only active users). Sending is done by `npm run bots` (must be running): about 20 messages / second per bot, Telegram 429 "retry after" is respected, temporary errors are retried up to 3 times, users who blocked the bot are marked failed.
- The history shows sent / failed / waiting per broadcast (live while sending), with **Stop** and **Retry failed**.

## Account check

A blogger can only submit videos of his **approved linked accounts**. YouTube: channel (`@handle` or `/channel/UC…`) is compared through the YouTube API. Instagram / Facebook: the owner is read from the link or from the data provider. A video from another account is rejected with "Account not linked". If the owner cannot be read, the video is accepted as **⚠ unverified** for admin (set `STRICT_OWNER_CHECK="true"` to reject instead). A duplicate link is saved as a **repost** (shown in the app and in Admin → Videos → Reposts). Bloggers can also paste a link in the blogger bot.

## APIs

- **YouTube:** official Data API v3 (views, likes, comments, channel).
- **Instagram / Facebook:** no official public-view API for other people's reels, so data providers are used: Instagram via RapidAPI (`RAPIDAPI_KEY`, `RAPIDAPI_HOST`) or Apify (`APIFY_TOKEN`), Facebook via Apify (`APIFY_TOKEN`). Check each actor's price and output on apify.com, change `APIFY_*_ACTOR` / `APIFY_*_INPUT` if you pick another one. When no data comes back, type the views manually on Videos.
- **Facebook accounts:** `facebook.com/<page>`, `profile.php?id=…`, `/people/<name>/<id>`, `/pages/<name>/<id>`, `/p/<Page-Name-id>/`. Facebook videos whose owner cannot be matched are accepted as "⚠ unverified" for the admin (set `STRICT_FACEBOOK_OWNER="true"` to reject instead).

## Bots

- **Agent bot:** `/start` → token login → buttons **My Profile · Add Blogger · Language · Open App**.
- **Blogger bot:** `/start` alone registers the blogger (with an agent link the agent is assigned and earns the bonus). Buttons **Open App · Language**. Everything else is inside the Mini App.
- **Open App (Telegram Web App, `/app`):** Home, Videos (submit + status + views + earnings), Accounts / Bloggers (+ create blogger link for agents), Payments (payment details, request payment, history), Settings (English / हिंदी).

## Supported video links (checked Oct 2026)

- **YouTube:** `watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/` → saved as one canonical link (same video can't be submitted twice).
- **Instagram:** `/reel/`, `/reels/`, `/p/`, `/tv/`, `/<user>/reel/`, new `/share/…` links; tracking params removed.
- **Facebook:** `/reel/ID`, `/<page>/reel/ID`, `/share/r|v|p/…`, `/watch/?v=`, `/…/videos/ID`, `/…/videos/<title>/ID`, `fb.watch/…`.
- Also ShareChat, Moj, TikTok, Other (https + domain check).
- All three now count a view when playback starts (YouTube: Shorts since 31 Mar 2025, all formats from 24 Aug 2026 per reports; Instagram: "Views" replaced Plays/Impressions in Apr 2025; Facebook Page Insights dropped Impressions in Nov 2025). Pay is per "views", so numbers are comparable across platforms.
- Auto view fetch: **YouTube** with `YOUTUBE_API_KEY`. Instagram/Facebook don't expose public view counts through an official API without the owner's login, so use a data provider in `src/lib/views.ts` or edit views in Admin → Videos.
- Instagram "repost" feature: reposted videos belong to someone else; reject them in moderation if you don't want them.

## Setup

```bash
cp .env.example .env        # fill values (openssl rand -base64 48 for secrets)
npm install
npm run db:push             # create / update tables (PostgreSQL); run again after every schema change
npm run db:retrack          # once, after upgrading: running videos -> approval time + 168 hours
npm run db:seed             # first admin + rates (800/million) + agent bonus (200)
npm run dev                 # admin panel -> http://localhost:3000/login
npm run bots                # starts both Telegram bots (separate process)
```

1. Create 2 bots in @BotFather; put tokens + blogger bot username in `.env`.
2. Set `WEBAPP_URL=https://YOUR_DOMAIN/app` (HTTPS required) → "Open App" button + chat menu button appear in both bots.
3. Admin → Agents → create agent → copy token (shown once) → agent logs in via Agent bot.
4. Cron (**every hour**): `GET /api/cron/fetch-views` with header `Authorization: Bearer $CRON_SECRET`.

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
