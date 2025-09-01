// server/routes-evening.js
import { Router } from 'express';
import { formatApiOk, formatApiErr as formatApiError } from '../src/lib/api/format-response.js';
import { buildEveningSim } from './services/evening-sim.js';
import { pickNightWindow } from './services/time-window.js';
import { fetchEveningInputs } from './services/evening-inputs.js'; // din befintliga (kan falla tillbaka)
import { buildEveningPayload } from './services/evening-payload.js'; // din befintliga

export const router = Router();

router.get('/api/evening', async (req, res) => {
  try {
    const useSim = req.query.sim === '1' || req.query.mock === '1';

    let payload;
    if (useSim) {
      // 1) simulera
      const sim = buildEveningSim();
      // 2) välj kväll/natt-fönster
      const tl = pickNightWindow(sim.timeline, { minHours: 6 });
      payload = {
        location: sim.location,
        now: tl[0] ?? sim.now,
        timeline: tl,
        observed: [],
        meta: { version: 1, unit: 'score0_10', degraded: true, tag: 'sim-night-v1' }
      };
      return res.json(formatApiOk(payload));
    }

    // Riktig väg (kan fallback:a)
    let inputs;
    try {
      inputs = await fetchEveningInputs();
    } catch (e) {
      // DB/API strul → simulera, men markera degraded
      const sim = buildEveningSim();
      const tl = pickNightWindow(sim.timeline, { minHours: 6 });
      const degraded = {
        location: sim.location,
        now: tl[0] ?? sim.now,
        timeline: tl,
        observed: [],
        meta: { version: 1, unit: 'score0_10', degraded: true, tag: 'sim-fallback' }
      };
      return res.json(formatApiOk(degraded));
    }

    const full = await buildEveningPayload(inputs); // bygger timeline m.m. av dina inputs
    const tl = pickNightWindow(full.timeline, { minHours: 6 });
    const final = { ...full, timeline: tl, meta: { ...full.meta, degraded: false } };
    return res.json(formatApiOk(final));
  } catch (err) {
    console.error('[evening] error:', err);
    return res.status(500).json(formatApiError('api.error.internal', { message: String(err?.message || err) }));
  }
});

export default router;   // 👈 default-export