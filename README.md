# Chorus

Unified live-stream chat for **Twitch**, **YouTube**, and **TikTok** — one **Apple liquid glass** UI — soft frosted panels, subtle borders, and smooth motion — with platform icons and native role badges.

![Stack](https://img.shields.io/badge/TypeScript-Vite%20%2B%20React%20%2B%20Node-8b7cff)

## Features

- Paste Twitch / YouTube / TikTok stream links and they connect
- Platform icon on every message (Twitch / YouTube / TikTok)
- Role badges next to usernames (subs, mods, VIPs, members, gifters, …)
- Timestamps, auto-scroll with **pause-on-hover**, jump-to-latest
- Filter chat by platform
- **Clear chat** button in the chat toolbar (wipes the feed; streams stay connected)
- **Focus chat** — hide the connect sidebar for fullscreen chat (toolbar toggle; Esc exits; preference saved)
- Optional **demo mode** (`DEMO_MODE=true`) with sample messages + badges (no API keys)
- Live connectors: Twitch (IRC + Helix badges), YouTube (Live Chat API), TikTok (unofficial Webcast)

## Download Windows (no npm)

Grab the latest **Windows installer or portable `.exe`** from [GitHub Releases](https://github.com/GrizJW/chorus/releases):

1. Open the newest release (e.g. `v1.0.7`)
2. Download **`Chorus-1.0.7-x64.exe`** (NSIS installer) or **`Chorus-1.0.7-x64-portable.exe`** (no install)
3. Run it — paste Twitch / YouTube / TikTok stream links in the sidebar

The app is **unsigned** for v1, so Windows SmartScreen may warn (“Windows protected your PC”). Choose **More info → Run anyway**.

Optional extras (YouTube Data API key, TikTok session / Euler Community key): create a `.env` in `%APPDATA%\Chorus\.env` using `.env.example`. **YouTube chat needs no Google Cloud key** (Innertube). **TikTok full chat needs `TIKTOK_SESSION_ID`** (gifts often work without it). **No Euler Business plan**.

## Quick start (contributors)

```bash
git clone https://github.com/GrizJW/chorus.git
cd chorus
cp .env.example .env
npm install
npm run dev
```

- UI: http://localhost:5173  
- API / WebSocket: http://localhost:8787 (`/ws`)

**Paste a stream link** in the sidebar (Twitch, YouTube, or TikTok) and hit Connect. Live mode is the default (`DEMO_MODE=false`).

- **Twitch** — works from a channel link / username; no keys required for public chat
- **TikTok** — works from `@user/live` (or short links when resolvable); creator must be **LIVE**; no Euler Business plan needed. **Gifts often work anonymously; full chat usually needs** `TIKTOK_SESSION_ID` (+ optional `TIKTOK_TT_TARGET_IDC`) in `%APPDATA%\Chorus\.env`. Free Euler Community `TIKTOK_SIGN_API_KEY` is an optional connect fallback only
- **YouTube** — paste a live link / `@handle` while LIVE; **no API key required** (Innertube). Optional `YOUTUBE_API_KEY` is Data API fallback only

### Optional demo mode

To try sample multi-platform chat without connecting live streams:

```env
DEMO_MODE=true
```

Restart the server. Demo mode replaces live connectors with scripted messages.

### Production-ish local run

```bash
npm run build
npm start
# serves API + built client on PORT (default 8787)
```

## Credentials

| Platform | Required for live chat? | Env vars | Notes |
| --- | --- | --- | --- |
| **Twitch** | No for public chat | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (optional) | Anonymous `tmi.js` IRC reads public chat. Helix app token improves **channel-specific sub badge images** and display-name resolve. Create an app at [Twitch Dev Console](https://dev.twitch.tv/console/apps). |
| **YouTube** | **No** for basic chat | Optional `YOUTUBE_API_KEY` | Default: unofficial **Innertube** (`youtubei.js`) — paste a live URL or `@handle` while LIVE. Optional official Data API v3 key is fallback only if Innertube fails. |
| **TikTok** | Session cookie **recommended for full chat**; **no Euler Business plan** | `TIKTOK_SESSION_ID` + optional `TIKTOK_TT_TARGET_IDC` (chat); free Community `TIKTOK_SIGN_API_KEY` (connect fallback) | Uses unofficial `tiktok-live-connector` **v2** with free rooms signing (gift catalog prefetch disabled). Anonymous WS often gets **gifts only**; set session + `authenticateWs` for chat. Creator must be **LIVE**. Do not buy Euler Business. |

Example `.env` (live by default):

```env
DEMO_MODE=false
PORT=8787
CLIENT_ORIGIN=http://localhost:5173
# Optional Twitch Helix (better badges):
# TWITCH_CLIENT_ID=your_client_id
# TWITCH_CLIENT_SECRET=your_client_secret
# Optional YouTube Data API fallback (Innertube needs no key):
# YOUTUBE_API_KEY=your_api_key
# TIKTOK_SESSION_ID=your_sessionid_cookie   # recommended for full chat (gifts work without it)
# TIKTOK_TT_TARGET_IDC=useast1a            # from tt-target-idc cookie (optional)
# TIKTOK_SIGN_API_KEY=                     # optional free Euler Community key — NOT Business
```

### Accepted stream inputs

- **Twitch:** `https://twitch.tv/shroud`, `https://m.twitch.tv/shroud`, `shroud`, `twitch:shroud`
- **YouTube:** `https://youtube.com/@handle`, `https://youtube.com/live/…`, `https://youtube.com/watch?v=…`, `youtube:@handle`
- **TikTok:** `https://www.tiktok.com/@user/live`, `vm.tiktok.com/…` (resolved when possible), `tiktok:user`, `@user`

## Badges per platform

### Twitch

| Source | What you get |
| --- | --- |
| IRC tags (`tmi.js`) | `badges` map: broadcaster, moderator, VIP, subscriber (+ months via `badge-info`), bits, turbo, premium/Prime, staff, founder, etc. |
| Helix `Get Global/Channel Chat Badges` | Real **image URLs** for global + channel-specific sub badges when `TWITCH_CLIENT_ID` + secret are set |
| Fallback | Well-known static CDN URLs for common global badges (used in demo + when Helix is unset) |

Badges render as **images** next to the username (with pill fallback if an image fails).

### YouTube

Default path is unofficial **Innertube** via [`youtubei.js`](https://github.com/LuanRT/YouTube.js) (same web client endpoints the site uses). **No Google Cloud / `YOUTUBE_API_KEY` required** for public live chat.

When the source provides them, Chorus maps:

| Source signal | Chorus badge |
| --- | --- |
| Owner / creator | OWNER pill |
| Moderator | MOD pill |
| Member / sponsor (incl. custom badge image when present) | MEMBER pill |
| Verified | Verified pill |

Also surfaces Super Chat / Super Sticker / membership events as donation chips.

Optional: set `YOUTUBE_API_KEY` to enable official Data API v3 as a **fallback** if Innertube fails.

**Honest limits:**

- Unofficial Innertube path — can break when Google changes internal clients
- Streamer must be **live**; offline channels/handles fail to connect
- Role badges depend on what Innertube (or the Data API) returns; tier images are best-effort
- Not affiliated with Google/YouTube; personal/overlay tooling, not a production SLA

### TikTok

There is **no official** public Live Chat API. Chorus uses [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) (Webcast reverse engineering).

When the connector provides them, Chorus maps:

- Moderator / operator flags → MOD-style badge
- Gifter level → `Gifter Lv.N` pill
- Fan club / team member → FAN pill
- `userBadges` image URLs when present
- Gift events → donation chip (gift name, combo, diamonds)

**Honest limits:**

- Unofficial — can break when TikTok changes Webcast/signing
- Streamer must be **live**; offline usernames fail to connect
- **Anonymous WebSocket often receives gifts but filters chat heavily.** Full chat needs a logged-in TikTok session (`TIKTOK_SESSION_ID` + optional `TIKTOK_TT_TARGET_IDC`) so Chorus can enable authenticated WS
- **No Euler Business plan** is required. Chorus skips the paid gift-catalog prefetch; gift events still arrive over the live WebSocket
- Free Euler Community API key is an optional connect/signing fallback only — ignore any “Purchase a Business plan” message from older builds; update Chorus instead
- Badge fields differ by library version / region; not every role TikTok shows in-app is always present
- Not affiliated with ByteDance; use for personal/overlay tooling, not as a guaranteed production SLA

#### Windows: enable full TikTok chat (session cookie)

Do **not** buy an Euler Business plan for Chorus.

Without a session, Chorus may connect and show **gifts** while **chat stays empty**. To get full chat:

1. Run Chorus once so `%APPDATA%\Chorus\` exists
2. Log into [tiktok.com](https://www.tiktok.com) in Chrome/Edge
3. DevTools → **Application** → **Cookies** → `https://www.tiktok.com`
4. Copy **`sessionid`** (and optionally **`tt-target-idc`**)
5. Create or edit `%APPDATA%\Chorus\.env`:

```env
# Required for full TikTok chat (gifts work without this)
TIKTOK_SESSION_ID=paste_sessionid_here
# Optional — from the tt-target-idc cookie (default useast1a)
TIKTOK_TT_TARGET_IDC=useast1a
# Optional — free Euler Community key only if connect/signing still fails
# TIKTOK_SIGN_API_KEY=your_free_community_key
```

6. Fully quit and restart Chorus, then reconnect while the creator is **LIVE**

If connect still fails with a signing/403 after that, add a **free** Euler Community API key from [eulerstream.com](https://www.eulerstream.com) as `TIKTOK_SIGN_API_KEY` (still do not buy Business).

## Architecture

```
chorus/
  client/          Vite + React UI (liquid glass chat, filters, badges)
  server/          Express + WebSocket hub
    adapters/      twitch.ts | youtube.ts | tiktok.ts | demo.ts
  electron/        Desktop shell (starts API, loads built UI)
  shared/          ChatMessage, Badge, StreamSource types
```

- **Adapters** normalize each platform into a shared `ChatMessage` with `badges[]`
- **ChatHub** fans messages out over WebSocket (`/ws`) and REST (`/api/streams`)
- **DemoAdapter** injects scripted multi-platform chat when `DEMO_MODE=true`

```
Browser ──WS──► ChatHub ──► TwitchAdapter (tmi.js + Helix badges)
                     ├──► YouTubeAdapter (googleapis liveChatMessages)
                     ├──► TikTokAdapter (tiktok-live-connector)
                     └──► DemoAdapter (sample feed, optional)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API + Vite concurrently |
| `npm run build` | Build client + compile server |
| `npm start` | Serve API (and built client when `NODE_ENV=production`) |
| `npm run typecheck` | TypeScript check |
| `npm run electron:dev` | Build then launch Electron desktop shell |
| `npm run electron:build` | Build Windows installer + portable `.exe` (via electron-builder) |

Tagged releases (`v*`) trigger GitHub Actions on `windows-latest` to publish `.exe` assets to [Releases](https://github.com/GrizJW/chorus/releases).

## License

MIT — built for GrizJW / Chorus.
