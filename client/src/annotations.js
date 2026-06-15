const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

// Fetches annotations from our server for a given track
// Returns an array of { fragment, annotation, charIndex } objects

export async function fetchAnnotations(track) {
    const params = new URLSearchParams({
        title: track.title,
        artist: track.artist
    });

    try {
        const response = await fetch(`${SERVER_URL}/api/annotations?${params}`);
        console.log('[annotations] status:', response.status, 'url:', response.url)
        if (!response.ok) return [];
        const data = await response.json();
        console.log('[annotations] returned:', data.length, data[0])
        return data;
    } catch (err) {
        console.error('[annotations] fetch threw:', err);
        return [];
    }
}
