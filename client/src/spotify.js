// Vite exposes any env var prefixed with VITE_ to the browser at build time
// Falls back to the local dev server so the app works without a .env file
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

// ─── STATE ───────────────────────────────────────────────────────────────────
// These variables track the current playback state
// They live outside any function so they persist between polling calls

let accessToken = null;
let currentTrackId = null;
let positionMs = 0;
let lastPollTime = Date.now();
let isPlaying = false;

// ─── INITIALISE ──────────────────────────────────────────────────────────────
// Fetches the access token from our server on startup
// Must be called before polling starts

export async function initSpotify() {
    const response = await fetch(`${SERVER_URL}/auth/token`);

    if (!response.ok) {
        return false;
    }

    const data = await response.json();
    accessToken = data.access_token;
    return true
}


// ─── SPOTIFY FETCH WRAPPER ───────────────────────────────────────────────────
// All Spotify API calls go through this function
// It handles 401 (token expired) by refreshing the token and retrying
// This means the rest of the code never has to worry about token expiry

async function spotifyFetch(url) {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (response.status === 401) {
        const refreshResponse = await fetch(`${SERVER_URL}/auth/refresh`, {
            method: 'POST',
        });
        const data = await refreshResponse.json();
        accessToken = data.access_token;

        return fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    return response;
}

 
// ─── POLL CURRENTLY PLAYING ──────────────────────────────────────────────────
// Called every 3 seconds to check what's playing on Spotify
// onTrackChange is a callback function — it gets called when a new track
// is detected, so the caller can kick off lyrics + annotations fetches
// Callbacks are how you pass behaviour into a function without hardcoding it

export async function pollCurrentlyPlaying(onTrackChange) {
    const response = await spotifyFetch('https://api.spotify.com/v1/me/player/currently-playing');

    if (response.status === 204) {
        isPlaying = false;
        return;
    }

    const data = await response.json();

    if (!data.item || data.item.type !== 'track') return;

    isPlaying = data.is_playing;
    positionMs = data.progress_ms;
    lastPollTime = Date.now();

    if (data.item.id !== currentTrackId) {
        currentTrackId = data.item.id;

        onTrackChange({
            id: data.item.id,
            title: data.item.name,
            artist: data.item.artists[0].name,
            album: data.item.album.name,
            duration: data.item.duration_ms,
            albumArt: data.item.album.images[0]?.url
        });
    }
}

// ─── GET INTERPOLATED POSITION ───────────────────────────────────────────────
// Spotify only tells us the position every 3 seconds when we poll
// Between polls we calculate the current position ourselves
// by adding the elapsed time since the last poll to the last known position
// This gives smooth position updates at 100ms intervals without hammering the API

export function getInterpolatedPosition() {
    if (!isPlaying) return positionMs;
    return positionMs + (Date.now() - lastPollTime);
}