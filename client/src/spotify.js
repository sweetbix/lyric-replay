const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

let accessToken = null;
let currentTrackId = null;
let positionMs = 0;
let lastPollTime = Date.now();
let isPlaying = false;

export async function initSpotify() {
    try {
        const response = await fetch(`${SERVER_URL}/auth/token`);
        if (!response.ok) return false;
        const data = await response.json();
        accessToken = data.access_token;
        return true;
    } catch (err) {
        console.error('Failed to fetch token:', err);
        return false;
    }
}

// All Spotify API calls go through here. On 401 it silently refreshes the
// token and retries once. If the refresh itself fails we return null so the
// caller can skip gracefully rather than crashing.
async function spotifyFetch(url) {
    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (response.status !== 401) return response;

        // Token expired — attempt a silent refresh
        try {
            const refreshResponse = await fetch(`${SERVER_URL}/auth/refresh`, { method: 'POST' });
            if (!refreshResponse.ok) {
                console.error('Token refresh failed:', refreshResponse.status);
                return null;
            }
            const data = await refreshResponse.json();
            accessToken = data.access_token;
        } catch (err) {
            console.error('Token refresh request failed:', err);
            return null;
        }

        return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (err) {
        console.error('Spotify fetch failed:', err);
        return null;
    }
}

export async function pollCurrentlyPlaying(onTrackChange) {
    const response = await spotifyFetch('https://api.spotify.com/v1/me/player/currently-playing');

    // null means spotifyFetch hit a network error or refresh failed — skip quietly
    if (!response) return;

    if (response.status === 204) {
        isPlaying = false;
        return;
    }

    let data;
    try {
        data = await response.json();
    } catch (err) {
        console.error('Failed to parse Spotify response:', err);
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
