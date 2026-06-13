import { Router } from 'express';

const router = Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

const tokens = {
    access: null,
    refresh: null,
    expiresAt: null,
};

// ─── ROUTE 1: /auth/login ────────────────────────────────────────────────────
// The user visits this URL to kick off the login flow
// We don't handle credentials here — we just redirect them to Spotify's
// official login page and let Spotify deal with username/password
router.get('/login', (req, res) => {
    const scopes = [
        'user-read-currently-playing',
        'user-read-playback-state',
    ].join(' '); // Spotify expects scopes as a space-separated string

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: scopes,
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// ─── ROUTE 2: /auth/callback ─────────────────────────────────────────────────
// Spotify redirects the user back here after they approve (or deny) the app
// The URL will contain a ?code= parameter — a one-time authorization code
// We exchange that code for actual access/refresh tokens
// This route is async because it makes an HTTP request to Spotify
router.get('/callback', async (req, res) => {

    const { code, error } = req.query;

    if (error) {
        return res.status(400).json({ error });
    }

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

    // If Spotify rejected the exchange (e.g. code already used, redirect URI mismatch)
    if (data.error) {
        return res.status(400).json({ data });
    }

    tokens.access = data.access_token;
    tokens.refresh = data.refresh_token;
    tokens.expiresAt = Date.now() + data.expires_in * 1000;

  // Send the user back to the frontend — auth is complete
  res.redirect('http://localhost:5173');

});

// ─── ROUTE 3: /auth/refresh ──────────────────────────────────────────────────
// Access tokens expire after 1 hour — this route gets a new one
// The frontend calls this silently in the background when a request returns 401
// The user never sees this happen
router.post('/refresh', async (req, res) => {

    // Can't refresh if we never did the initial login
    if (!tokens.refresh) {
        return res.status(401).json({ error: 'No refresh token available' });
    }

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

    if (data.error) { 
        return res.status(400).json({ data });
    }

    tokens.access = data.access_token;
    tokens.expiresAt = Date.now() + data.expires_in * 1000;
    
    res.json({ access_token: tokens.access });

});

// ─── ROUTE 4: /auth/token ────────────────────────────────────────────────────
// The frontend calls this on startup to get the current access token
// Rather than storing the token in the browser (less secure),
// the frontend asks the server for it whenever it needs 
router.get('/token', (req, res) => {
    if (!tokens.access) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
        access_token: tokens.access,
        expires_at: tokens.expiresAt,   
    });
});

export default router;

export function getAccessToken() {
    return tokens.access;
}