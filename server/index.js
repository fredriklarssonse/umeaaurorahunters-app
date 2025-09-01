// server/index.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import evening from './routes-evening.js'; // default-exporten

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health-check
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Mounta routern (den innehåller GET /api/evening)
app.use(evening);

// Fallback 404 (för att se tydligt vad som saknas)
app.use((_req, res) => {
  res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[aurora-api] listening on http://localhost:${PORT}`);
});
