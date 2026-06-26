import { Router } from 'express';
import { searchSong, getReferents } from './genius.js';

const router = Router();

// In-memory cache keyed by normalised "title-artist"
// Eliminates the full Genius round trip on repeat listens
const annotationCache = new Map();

// ── Demo search via Deezer (no API key needed) ───────────────────────────────
router.get('/demo/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'q is required' });
    try {
        const r = await fetch(
            `https://api.deezer.com/search?${new URLSearchParams({ q, limit: 5 })}`
        );
        const data = await r.json();
        const tracks = (data.data ?? []).map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist.name,
            album: t.album.title,
            duration: t.duration * 1000,
            albumArt: t.album.cover_medium,
            previewUrl: t.preview,
        }));
        res.json(tracks);
    } catch (err) {
        console.error('Demo search failed:', err);
        res.json([]);
    }
});

router.get('/demo/youtube', async (req, res) => {
    const { title, artist } = req.query;
    if (!title || !artist) return res.status(400).json({ error: 'title and artist required' });
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY not set' });
    try {
        const q = `${title} ${artist} official audio lyrics`;
        const r = await fetch(
            `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({ part: 'snippet', type: 'video', q, maxResults: 1, videoCategoryId: '10', key: apiKey })}`
        );
        const data = await r.json();
        const videoId = data.items?.[0]?.id?.videoId ?? null;
        res.json({ videoId });
    } catch (err) {
        console.error('YouTube search failed:', err);
        res.json({ videoId: null });
    }
});

router.get('/annotations', async (req, res) => {
    const { title, artist } = req.query;

    if (!title || !artist) {
        return res.status(400).json({ error: 'title and artist are required' });
    }

    const key = `${title.toLowerCase().trim()}-${artist.toLowerCase().trim()}`;

    if (annotationCache.has(key)) {
        return res.json(annotationCache.get(key));
    }

    try {
        const song = await searchSong(title, artist);

        if (!song) {
            annotationCache.set(key, []);
            return res.json([]);
        }

        const referents = await getReferents(song.id);

        annotationCache.set(key, referents);
        res.json(referents);
    } catch (err) {
        console.error('Error fetching annotations:', err);
        return res.json([]);
    }
});

export default router;
