# Lyric Replay

Real-time synced lyrics with Genius annotations for your currently playing Spotify track.

---

## What it does

Lyric Replay polls your Spotify account every 3 seconds to detect what you're listening to. When a track changes, it fetches timestamped lyrics from LRC Lib and annotations from Genius in parallel, then merges them. Every 100ms, it interpolates your playback position and highlights the current lyric line — surfacing any Genius annotation attached to it in a side panel.

---

## Tech stack


| Layer    | Tech                                        |
| -------- | ------------------------------------------- |
| Frontend | React + Vite                                |
| Backend  | Node.js + Express                           |
| Scraping | Cheerio                                     |
| Auth     | Spotify OAuth 2.0 (Authorization Code flow) |


---

## External services


| Service         | Used for                                   | Auth required                  |
| --------------- | ------------------------------------------ | ------------------------------ |
| Spotify Web API | Currently playing track, position, library | OAuth (free account supported) |
| Genius API      | Song search, referents (annotations)       | Bearer token                   |
| LRC Lib         | Timestamped synced lyrics                  | None                           |


---

## Project structure

```
lyric-replay/
├── server/
│   ├── index.js          # Express entry point
│   ├── auth.js           # Spotify OAuth routes
│   ├── genius.js         # Genius search, referents, Cheerio scraper
│   └── .env
├── client/
│   ├── src/
│   │   ├── app.js        # Main loop + state
│   │   ├── spotify.js    # Polling + token management
│   │   ├── lyrics.js     # LRC Lib fetch + LRC parser
│   │   ├── annotations.js# Genius fetch + fragment matcher
│   │   └── ui.js         # DOM / React updates
│   └── index.html
├── .env.example
└── README.md
```

---

## Prerequisites

- Node.js 18+
- A Spotify account (free works — no Premium required)
- A Spotify Developer app — register at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
- A Genius API client — register at [genius.com/api-clients](https://genius.com/api-clients)

---

## Setup

**1. Clone and install**

```bash
git clone https://github.com/you/lyric-replay.git
cd lyric-replay
 
cd server && npm install
cd ../client && npm install
```

**2. Configure environment variables**

Copy `.env.example` to `server/.env` and fill in your credentials:

```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/callback
GENIUS_TOKEN=
```

**3. Register your redirect URI**

In your Spotify Developer Dashboard, add `http://localhost:3000/auth/callback` as an allowed redirect URI.

**4. Run**

In two separate terminals:

```bash
# Terminal 1 — backend
cd server && node index.js
 
# Terminal 2 — frontend
cd client && npm run dev
```

Frontend runs on `http://localhost:5173`. Backend runs on `http://localhost:3000`.

Open the frontend, click login, approve Spotify access, and play something.

---

## How it works

**On every 3-second Spotify poll:**

- If the track ID has changed, a track-change event fires
- LRC Lib and Genius are fetched in parallel (`Promise.all`)
- Genius annotations are matched to lyric lines by string-searching each fragment against the full lyrics text
- The merged result (`[{ time, text, annotation }]`) is stored in state
**Every 100ms:**
- Playback position is interpolated from the last known Spotify timestamp
- The active lyric line is found via `findLastIndex(line => line.time <= posMs)`
- If that line has an annotation, it's displayed in the annotation panel
**Token refresh:**
- Spotify access tokens expire after 60 minutes
- All Spotify fetch calls wrap a 401 handler that hits `/auth/refresh` and retries silently

---

## Known limitations

- LRC Lib doesn't have synced lyrics for every track — the app falls back to an "unavailable" state rather than crashing
- Genius annotations are community-written and vary wildly in quality and coverage
- Genius does not serve lyrics via API — the lyrics scrape depends on their page structure, which may break if Genius updates their HTML
- The Web Playback SDK (for Premium users who want in-app playback control) is not implemented — playback must be started from another Spotify client

---

## Environment variables reference


| Variable                | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `SPOTIFY_CLIENT_ID`     | From your Spotify Developer app                       |
| `SPOTIFY_CLIENT_SECRET` | From your Spotify Developer app                       |
| `SPOTIFY_REDIRECT_URI`  | Must match exactly what's registered in the dashboard |
| `GENIUS_TOKEN`          | Client access token from genius.com/api-clients       |


---

