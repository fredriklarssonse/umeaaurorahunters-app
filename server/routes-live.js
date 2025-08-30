// server/routes-live.js
import { Router } from 'express';

export const router = Router();

// GET /api/live?lat&lon
router.get('/live', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const nowIso = new Date().toISOString();

    // TODO: bygg nowcast −1h…+1h + ETA L1 + priming/reconnection + cameras + sat frames
    return res.json({
      now: nowIso,
      eta_l1_min: null,
      priming: 'unknown',
      reconnection: { class: 'unknown' },
      nowcast: { activity: [], environment: [], sight: [] },
      events: [],
      cameras: [],
      spots: [],
      meta: { lat, lon },
    });
  } catch (e) {
    console.error('[live]', e);
    res.status(500).json({ error: 'live_failed' });
  }
});
