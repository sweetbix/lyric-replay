import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRouter from './auth.js';

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/auth', authRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(3000, () => console.log('Server on :3000'));