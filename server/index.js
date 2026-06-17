import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRouter from './auth.js';
import apiRouter from './api.js';

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

app.use('/auth', authRouter);
app.use('/api', apiRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server on :${PORT}`));
