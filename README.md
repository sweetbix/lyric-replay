# Lyric Replay

Search any song and see its lyrics sync live — with Genius annotations surfacing what each line actually means, right as it plays.

Type a song into the search bar, pick a result, and watch the lyrics highlight in time with the audio. Underlined lines have a Genius annotation attached; click one (or just let the song play) and the explanation fades in on the right. No account needed.

If you use Spotify, you can also log in to sync Lyric Replay to whatever you're already listening to — lyrics and annotations follow your playback automatically, across any device.

---

## Features

- **Search any song** — powered by Deezer metadata and YouTube audio; no account required
- **Genius annotations** — crowdsourced explanations, trivia, and literary breakdowns appear in a side panel as each annotated line becomes active, or on click
- **Timestamped lyrics** — lyrics highlight in sync with playback, updated every 100 ms
- **Spotify live mode** — log in with Spotify to follow your real-time playback instead of searching manually
- **Graceful degradation** — missing lyrics, annotations, or audio are each surfaced independently without breaking the rest of the UI

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React / Vite)                │
│                                                          │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  Login / │    │  App (Spotify│    │  DemoScreen   │  │
│  │  search  │    │  live mode)  │    │  (no-auth)    │  │
│  └──────────┘    └──────┬───────┘    └───────┬───────┘  │
│                         │                    │           │
│            sessionStorage (encrypted token)  │           │
└─────────────────────────┼────────────────────┼───────────┘
                          │ X-Session-Token     │
                          ▼                     ▼
┌─────────────────────────────────────────────────────────┐
│              Express server (Node.js)                   │
│                                                         │
│   /auth/login → /auth/callback  (Spotify OAuth)         │
│   /auth/token  /auth/refresh    (token management)      │
│   /api/annotations              (Genius API proxy)      │
│   /api/demo/search              (Deezer proxy)          │
│   /api/demo/youtube             (YouTube Data API)      │
└───────┬──────────────┬────────────────┬─────────────────┘
        │              │                │
        ▼              ▼                ▼
   Spotify API    Genius API      YouTube / Deezer

Browser also calls directly:
   LRC Lib API  (timestamped lyrics — no key needed)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS v4 |
| Backend | Node.js, Express 5 |
| Lyrics | [LRC Lib](https://lrclib.net) (free, no key) |
| Annotations | Genius API |
| Demo audio | YouTube IFrame API |
| Demo metadata | Deezer API (no key) |
| Auth | Spotify OAuth 2.0 + AES-256-GCM session tokens |
| Deployment | Vercel (frontend) + Railway or Render (backend) |

---

## Local Development

### Prerequisites

- Node.js 20+
- A [Spotify Developer app](https://developer.spotify.com/dashboard) with `http://127.0.0.1:3000/auth/callback` in Redirect URIs
- A [Genius API client](https://genius.com/api-clients) (client access token)
- A [Google Cloud](https://console.cloud.google.com) project with YouTube Data API v3 enabled (for demo mode)

### Setup

```bash
# 1. Clone
git clone https://github.com/your-username/lyric-replay
cd lyric-replay

# 2. Server
cd server
npm install
cp .env.example .env
# Fill in your credentials in server/.env
npm run dev          # starts on http://127.0.0.1:3000

# 3. Client (separate terminal)
cd ../client
npm install
npm run dev          # starts on http://localhost:5173
```

### Environment Variables

#### `server/.env`

| Variable | Required | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Yes | From Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Yes | From Spotify Developer Dashboard |
| `SPOTIFY_REDIRECT_URI` | Yes | Must match Spotify dashboard exactly — use `http://127.0.0.1:3000/auth/callback` for local dev |
| `GENIUS_TOKEN` | Yes | Client access token from genius.com/api-clients |
| `YOUTUBE_API_KEY` | Yes | Google Cloud → YouTube Data API v3 |
| `SESSION_SECRET` | Prod only | 64-char hex string — `openssl rand -hex 32`. Random key used if absent (sessions die on restart) |
| `FRONTEND_URL` | Prod only | Your Vercel deployment URL — used for CORS and post-OAuth redirect |
| `PORT` | No | Server port (default: `3000`) |
| `NODE_ENV` | Prod only | Set to `production` to enforce `SESSION_SECRET` validation |

#### `client/.env` (create if needed)

| Variable | Default | Description |
|---|---|---|
| `VITE_SERVER_URL` | `http://127.0.0.1:3000` | Backend URL — set to your Railway/Render URL in production |

---

## How It Works

**On every 3-second Spotify poll:**
- If the track ID changed, lyrics (LRC Lib) and annotations (Genius) are fetched in parallel
- Each fragment from Genius is matched to its position in the lyrics text by normalised string search
- The merged result — `[{ time, text, annotation }]` — is stored in state

**Every 100 ms:**
- Playback position is interpolated from the last known Spotify timestamp using `Date.now()`
- `findLastIndex(line => line.time <= position)` finds the active line
- If that line has an annotation, it fades into the side panel

**Token management:**
- Spotify access tokens expire after 60 minutes; a 401 response triggers a silent `/auth/refresh` call and a retry
- The session token (encrypted with AES-256-GCM, stored in `sessionStorage`) is updated after each refresh and never touches a cookie or server-side store

---

## Known Limitations

- **YouTube quota** — YouTube Data API v3 free tier allows ~100 searches/day. The app shows "YouTube quota reached — try again tomorrow" when exhausted.
- **Genius coverage** — many tracks have no annotations, especially non-English or indie releases. The side panel shows a placeholder.
- **LRC Lib coverage** — synced lyrics are unavailable for some tracks. The app shows "Synced lyrics unavailable for this track".
- **Annotation matching** — when LRC Lib and Genius transcribe the same lyric differently (e.g. `go 'head` vs `gon' head`), the match fails silently. Fuzzy matching would increase coverage but also risk false positives.
- **No playback control** — Spotify scopes are read-only; playback must be started from another client.
- **Demo mode drift** — YouTube video start times vary; lyrics may be slightly ahead or behind the audio.

---

## License

MIT
