import { Router } from 'express';
import { randomUUID } from 'crypto';

const router = Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Per-user token store: authKey (UUID) → { access, refresh, expiresAt }
// Each user gets a UUID after OAuth. They send it as X-Auth-Key on every request.
const userTokens = new Map();

export function getTokens(authKey) {
    return userTokens.get(authKey);
}

export function setTokens(authKey, tokens) {
    userTokens.set(authKey, tokens);
}

async function refreshUserTokens(authKey) {
    const tokens = userTokens.get(authKey);
    if (!tokens?.refresh) throw new Error('No refresh token');

    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokens.refresh,
        }),
    });

    const data = await tokenRes.json();
    if (data.error) throw new Error(data.error);

    tokens.access = data.access_token;
    tokens.expiresAt = Date.now() + data.expires_in * 1000;
}

router.get('/login', (req, res) => {
    const scopes = [
        'user-read-currently-playing',
        'user-read-playback-state',
    ].join(' ');

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: scopes,
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) return res.status(400).json({ error });

    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
        }),
    });

    const data = await tokenRes.json();

    if (data.error) return res.status(400).json({ error: data.error });

    const authKey = randomUUID();
    userTokens.set(authKey, {
        access: data.access_token,
        refresh: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    });

    // Pass the key to the frontend via URL — no cookies needed
    res.redirect(`${FRONTEND_URL}?authKey=${authKey}`);
});

router.post('/refresh', async (req, res) => {
    const authKey = req.headers['x-auth-key'];
    if (!authKey || !userTokens.has(authKey)) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        await refreshUserTokens(authKey);
        res.json({ access_token: userTokens.get(authKey).access });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/token', async (req, res) => {
    const authKey = req.headers['x-auth-key'];
    const tokens = authKey ? userTokens.get(authKey) : null;

    if (!tokens?.access) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (Date.now() > tokens.expiresAt) {
        try {
            await refreshUserTokens(authKey);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    }

    res.json({
        access_token: tokens.access,
        expires_at: tokens.expiresAt,
    });
});

export default router;
