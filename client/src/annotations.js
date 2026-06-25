const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// Fetches annotations from our server for a given track
// Returns an array of { fragment, annotation, charIndex } objects

export async function fetchAnnotations(track) {
    const params = new URLSearchParams({
        title: track.title,
        artist: track.artist
    });

    try {
        const response = await fetch(`${SERVER_URL}/api/annotations?${params}`, {
            headers: { 'X-Session-Token': sessionStorage.getItem('session') || '' },
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (err) {
        console.error('[annotations] fetch threw:', err);
        return [];
    }
}
