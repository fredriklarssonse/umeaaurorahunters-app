// server/routes-longrange.js
import { Router } from 'express';
// db-hjälpare; se till att denna fil finns: src/lib/db/client-supa.js
import { dbSelect } from '../src/lib/db/client-supa.js';

export const router = Router();

// GET /api/forecast/longrange?lat&lon&days=3
router.get('/longrange', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const days = Math.min(Number(req.query.days || 3), 5);

    // TODO: fyll på med riktig logik när ingest-jobben finns
    const nights = [];
    return res.json({ nights, meta: { lat, lon, days } });
  } catch (e) {
    console.error('[longrange]', e);
    res.status(500).json({ error: 'longrange_failed' });
  }
});
