# Chorus

Unified live-stream chat for **Twitch**, **YouTube**, and **TikTok** — one dark, streamer-friendly UI with platform icons and native role badges.

![Stack](https://img.shields.io/badge/TypeScript-Vite%20%2B%20React%20%2B%20Node-8b7cff)

## Features

- Paste Twitch / YouTube / TikTok stream links and they connect
- Platform icon on every message (Twitch / YouTube / TikTok)
- Role badges next to usernames (subs, mods, VIPs, members, gifters, …)
- Timestamps, auto-scroll with **pause-on-hover**, jump-to-latest
- Filter chat by platform
- Optional **demo mode** (`DEMO_MODE=true`) with sample messages + badges (no API keys)
- Live connectors: Twitch (IRC + Helix badges), YouTube (Live Chat API), TikTok (unofficial Webcast)

## Download Windows (no npm)

Grab the latest **Windows installer or portable `.exe`** from [GitHub Releases](https://github.com/GrizJW/chorus/releases):

1. Open the newest release (e.g. `v1.0.2`)
2. Download **`Chorus-1.0.2-x64.exe`** (NSIS installer) or **`Chorus-1.0.2-x64-portable.exe`** (no install)
3. Run it — paste Twitch / YouTube / TikTok stream links in the sidebar

The app is **unsigned** for v1, so Windows SmartScreen may warn (“Windows protected your PC”). Choose **More info → Run anyway**.

Optional YouTube API key / TikTok extras: create a `.env` file in the app’s user-data folder (`%APPDATA%\Chorus\.env` on Windows) using the same keys as `.env.example`. **No Euler Business plan is required for TikTok chat.** Session cookie / free Community API key are only fallbacks if connect still fails after updating.

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
- **TikTok** — works from `@user/live` (or short links when resolvable); creator must be **LIVE**; no Euler Business plan needed. If connect still fails after updating, optionally set `TIKTOK_SESSION_ID` or a free Euler Community `TIKTOK_SIGN_API_KEY` in `%APPDATA%\Chorus\.env`
- **YouTube** — paste works, but you need `YOUTUBE_API_KEY` in `.env` once (YouTube Data API v3)

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
| **YouTube** | Yes | `YOUTUBE_API_KEY` | Enable **YouTube Data API v3** in [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com). API key is enough to poll public live chat. Channel must be **currently live** (or paste a live video URL). |
| **TikTok** | No official keys; **no Euler Business plan** | Optional `TIKTOK_SESSION_ID`, `TIKTOK_TT_TARGET_IDC`, free Community `TIKTOK_SIGN_API_KEY` | Uses unofficial `tiktok-live-connector` **v2** with free rooms signing (gift catalog prefetch disabled). Creator must be **LIVE**. Do not buy Euler Business for Chorus chat. |

Example `.env` (live by default):

```env
DEMO_MODE=false
PORT=8787
CLIENT_ORIGIN=http://localhost:5173
# Optional Twitch Helix (better badges):
# TWITCH_CLIENT_ID=your_client_id
# TWITCH_CLIENT_SECRET=your_client_secret
# Required only for YouTube:
# YOUTUBE_API_KEY=your_api_key
# TIKTOK_SESSION_ID=your_sessionid_cookie   # optional fallback if signing fails
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

Official **Live Streaming API** `authorDetails`:

| Flag | Chorus badge |
| --- | --- |
| `isChatOwner` | OWNER pill |
| `isChatModerator` | MOD pill |
| `isChatSponsor` | MEMBER pill |
| `isVerified` | Verified pill |

Also surfaces Super Chat / Super Sticker / membership events as donation chips.

**Honest limit:** The public API does **not** expose membership **tier badge images** or months. Chorus shows clear role pills (and avatar when provided) rather than inventing fake badge art. Scraping internal `youtubei` endpoints is intentionally avoided for maintainability and ToS reasons.

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
- **No Euler Business plan** is required for chat. Chorus skips the paid gift-catalog prefetch; gift events still arrive over the live WebSocket
- Session cookie / free Euler Community API key are optional fallbacks only (see below) — ignore any “Purchase a Business plan” message from older builds; update Chorus instead
- Badge fields differ by library version / region; not every role TikTok shows in-app is always present
- Not affiliated with ByteDance; use for personal/overlay tooling, not as a guaranteed production SLA

#### Windows: optional fallbacks if TikTok connect still fails

Do **not** buy an Euler Business plan for Chorus. Chat connect uses free rooms signing.

If you still see a signing/403 error after updating to the latest build:

1. Prefer a **free** Euler Community API key from [eulerstream.com](https://www.eulerstream.com) as `TIKTOK_SIGN_API_KEY` in `%APPDATA%\Chorus\.env`
2. Or set a logged-in TikTok `sessionid` cookie:
   - In Chrome/Edge while logged into [tiktok.com](https://www.tiktok.com), open DevTools → **Application** → **Cookies** → `https://www.tiktok.com`
   - Copy **`sessionid`** (and optionally **`tt-target-idc`**)
3. Example `%APPDATA%\Chorus\.env` (folder is created after you run Chorus once):

```env
# Optional — only if connect still fails after updating
TIKTOK_SIGN_API_KEY=your_free_community_key
TIKTOK_SESSION_ID=paste_sessionid_here
TIKTOK_TT_TARGET_IDC=useast1a
```

4. Restart Chorus and reconnect while the creator is **LIVE**

## Architecture

```
chorus/
  client/          Vite + React UI (dark chat, filters, badges)
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
