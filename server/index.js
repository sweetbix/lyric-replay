import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import authRouter from './auth.js';
import apiRouter from './api.js';

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();

const allowedOrigins = [
    FRONTEND_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
].filter((v, i, a) => a.indexOf(v) === i); // dedupe

app.use(cors({
    origin: allowedOrigins,
    allowedHeaders: ['Content-Type', 'X-Session-Token'],
    credentials: true,
}));
app.use(express.json());

const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

app.use('/api', apiLimiter);
app.use('/auth', authLimiter);

app.use('/auth', authRouter);
app.use('/api', apiRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server on :${PORT}`));
