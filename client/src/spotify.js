const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3000';

let accessToken = null;
let currentTrackId = null;
let positionMs = 0;
let lastPollTime = Date.now();
let isPlaying = false;

function getSession() {
    return sessionStorage.getItem('session');
}

function saveSession(session) {
    if (session) sessionStorage.setItem('session', session);
}

function serverFetchOpts(extra = {}) {
    return {
        ...extra,
        headers: { ...extra.headers, 'X-Session-Token': getSession() || '' },
    };
}

export async function initSpotify() {
    // Pull session token from URL after OAuth redirect
    const params = new URLSearchParams(window.location.search);
    const sessionFromUrl = params.get('session');
    if (sessionFromUrl) {
        saveSession(sessionFromUrl);
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }

    if (!getSession()) return false;

    try {
        const response = await fetch(`${SERVER_URL}/auth/token`, serverFetchOpts());
        if (!response.ok) return false;
        const data = await response.json();
        accessToken = data.access_token;
        saveSession(data.session);
        return true;
    } catch (err) {
        console.error('Failed to fetch token:', err);
        return false;
    }
}

async function spotifyFetch(url) {
    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (response.status !== 401) return response;

        try {
            const refreshResponse = await fetch(
                `${SERVER_URL}/auth/refresh`,
                serverFetchOpts({ method: 'POST' })
            );
            if (!refreshResponse.ok) return null;
            const data = await refreshResponse.json();
            accessToken = data.access_token;
            saveSession(data.session);
        } catch {
            return null;
        }

        return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (err) {
        console.error('Spotify fetch failed:', err);
        return null;
    }
}

export async function pollCurrentlyPlaying(onTrackChange) {
    const response = await spotifyFetch('https://api.spotify.com/v1/me/player');

    if (!response) return;

    if (response.status === 204) {
        isPlaying = false;
        return;
    }

    let data;
    try {
        data = await response.json();
    } catch {
        return;
    }

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

export function getInterpolatedPosition() {
    if (!isPlaying) return positionMs;
    return positionMs + (Date.now() - lastPollTime);
}
