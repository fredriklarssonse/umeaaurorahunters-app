// server/routes-evening.js
import express from 'express';
import { fetchEveningInputs } from './services/evening-inputs.js';

export const eveningRouter = express.Router();

// Dev: slå av cache i svar (annars 304 i dev kan förvirra)
eveningRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Enkel mock om ?mock=1 eller om DB fallerar
eveningRouter.get('/evening', async (req, res) => {
  const mock = req.query.mock === '1' || process.env.AURORA_FORCE_MOCK === '1';

  const fallback = () => {
    const base = new Date();
    const hours = Array.from({ length: 9 }, (_, i) => {
      const ts = new Date(base.getTime() + i * 3600_000);
      return {
        ts: ts.toISOString(),
        potential: [0.7, 1.1, 1.5, 1.5, 1.1, 1.1, 1.1, 1.1, 1.1][i] ?? 1.1,
        visibility: [0.4, 1, 4.7, 7.4, 9, 9.2, 8.1, 5.8, 2.4][i] ?? 5,
        breakdown: {
          visibility: [
            { code: 'breakdown.twilight', params: { elevationDeg: -6 - i * 2 } },
            { code: 'breakdown.moon', params: { illum: 0.55 + i * 0.01, altDeg: -2 - i * 5 } },
            { code: 'breakdown.clouds', params: { low: (i % 3) / 3, mid: ((i + 1) % 3) / 3, high: ((i + 2) % 3) / 3 } }
          ]
        }
      };
    });

    return res.json({
      location: { name: 'Umeå', lat: 63.8258, lon: 20.263 },
      now: { potential: 1.1, visibility: 5, i18n: { potential: 'forecast.potential.very_low', visibility: 'forecast.visibility.moderate' } },
      timeline: hours,
      observed: [],
      meta: { version: 1, unit: 'score0_10', degraded: true, tag: 'simple-mock-v1' }
    });
  };

  if (mock) return fallback();

  try {
    const payload = await fetchEveningInputs({ lat: 63.8258, lon: 20.263 });
    return res.json(payload);
  } catch (err) {
    console.warn('[evening] DB fel — faller tillbaka till mock:', err?.code || err?.message || err);
    return fallback();
  }
});
