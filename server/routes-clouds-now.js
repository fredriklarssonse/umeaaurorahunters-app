// server/routes-clouds-now.js
import express from 'express';

// Node 18+ har global fetch; om du kör äldre Node, installera node-fetch och importera det.
export const router = express.Router();

/**
 * GET /api/clouds-now?lat=63.8258&lon=20.263
 * Hämtar live/nowcast/hours molnandel 0..1 för low/mid/high.
 */
router.get('/clouds-now', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat ?? '63.8258');
    const lon = parseFloat(req.query.lon ?? '20.263');

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high` +
      `&forecast_days=2&timezone=auto`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const j = await r.json();

    const times = j?.hourly?.time ?? [];
    const low = j?.hourly?.cloud_cover_low ?? [];
    const mid = j?.hourly?.cloud_cover_mid ?? [];
    const high = j?.hourly?.cloud_cover_high ?? [];

    const samples = times.map((ts, i) => ({
      ts,
      low: (low[i] ?? 0) / 100,
      mid: (mid[i] ?? 0) / 100,
      high: (high[i] ?? 0) / 100
    }));

    res.json({ location: { lat, lon }, samples });
  } catch (err) {
    res.status(500).json({
      error: 'clouds-now.internal',
      details: { message: String(err?.message ?? err) }
    });
  }
});
