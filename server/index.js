import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRouter from './auth.js';
import { getAccessToken } from './auth.js';
const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/auth', authRouter);

// This route proxies the Spotify currently-playing call through your server
// The reason we do this server-side rather than directly from the browser is
// so the access token never has to leave the server — the frontend just asks
// your server "what's playing" and your server asks Spotify on its behalf
app.get('/currently-playing', async (req, res) => {
    const token = getAccessToken();
    
    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });

    // 204 means Spotify returned "no content" — nothing is currently playing
    // We return null so the frontend knows to show an idle state
    if (response.status === 204) {
        return res.json(null);
    }


    const data = await response.json();

    // Spotify can return an episode (podcast) instead of a track
    // We only care about music so filter out podcasts
    if (!data.item || data.item.type !== 'track') {
      return res.json(null);
    }

    res.json({
        id: data.item.id,
        title: data.item.name,
        artist: data.item.artists[0].name,
        album: data.item.album.name,
        duration: data.item.duration_ms,
        progress: data.progress_ms,
        isPlaying: data.is_playing,
        albumArt: data.item.album.images[0]?.url
    });
});



app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(3000, () => console.log('Server on :3000'));