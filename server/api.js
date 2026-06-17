import { Router } from 'express';
import { searchSong, getReferents } from './genius.js';

const router = Router();

// In-memory cache keyed by normalised "title-artist"
// Eliminates the full Genius round trip on repeat listens
const annotationCache = new Map();

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
