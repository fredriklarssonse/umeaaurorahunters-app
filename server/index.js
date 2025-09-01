// server/index.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { router as evening } from './routes-evening.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', evening);

// health
app.get('/api/healthz', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
  console.log(`[aurora-api] listening on http://localhost:${PORT}`);
});
