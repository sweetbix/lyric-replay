import { Router } from 'express';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const router = Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 32-byte AES key. Set SESSION_SECRET to a stable 64-char hex string in prod
// so sessions survive restarts. Without it a random key is generated per run.
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
if (process.env.NODE_ENV === 'production' && SECRET.length < 64) {
    throw new Error('SESSION_SECRET must be a 64-character hex string in production (generate with: openssl rand -hex 32)');
}
const KEY = Buffer.from(SECRET.slice(0, 64).padEnd(64, '0'), 'hex');

function encrypt(obj) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', KEY, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decrypt(token) {
    try {
        const buf = Buffer.from(token, 'base64url');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const encrypted = buf.subarray(28);
        const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
        decipher.setAuthTag(tag);
        const plain = decipher.update(encrypted) + decipher.final('utf8');
        return JSON.parse(plain);
    } catch {
        return null;
    }
}

// Reads the session token from the X-Session-Token header and decrypts it.
export function getTokens(req) {
    const raw = req.headers['x-session-token'];
    return raw ? decrypt(raw) : null;
}

async function refreshTokens(tokens) {
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

    return {
        access: data.access_token,
        refresh: data.refresh_token ?? tokens.refresh,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
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

    const session = encrypt({
        access: data.access_token,
        refresh: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        keyExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    res.redirect(`${FRONTEND_URL}?session=${session}`);
});

router.post('/refresh', async (req, res) => {
    const tokens = getTokens(req);
    if (!tokens?.refresh || Date.now() > tokens.keyExpiresAt) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const updated = await refreshTokens(tokens);
        res.json({ access_token: updated.access, session: encrypt({ ...updated, keyExpiresAt: tokens.keyExpiresAt }) });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/token', async (req, res) => {
    let tokens = getTokens(req);

    if (!tokens?.access || Date.now() > tokens.keyExpiresAt) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { keyExpiresAt } = tokens;

    if (Date.now() > tokens.expiresAt) {
        try {
            tokens = await refreshTokens(tokens);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    }

    res.json({
        access_token: tokens.access,
        expires_at: tokens.expiresAt,
        session: encrypt({ ...tokens, keyExpiresAt }),
    });
});

export default router;
