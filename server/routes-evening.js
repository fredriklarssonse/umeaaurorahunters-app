// server/routes-evening.js
import express from 'express';
import { fetchEveningInputs } from './services/evening-inputs.js';
import { buildEveningPayload } from './services/evening-payload.js'; // samma som tidigare (den du använde)
import { formatApiOk, formatApiErr } from '../src/lib/api/format-response.js'; // oförändrat

export const router = express.Router();

/**
 * Plocka ut solens höjd (degrees) ur varje timsteg om den finns.
 */
function getSunAltDegFromPoint(p) {
  if (!p?.breakdown?.visibility) return undefined;
  const tw = p.breakdown.visibility.find((it) => it?.code === 'breakdown.twilight');
  return tw?.params?.elevationDeg;
}

/**
 * Trimma timeline till “kvällens fönster”:
 * - Primärt tar vi timmar där solen ≤ -6° (nautisk skymning eller mörkare).
 * - Minst 6 timmar: om färre än 6 finns, välj 6 timmar centrerat kring “mörkast” (lägst solhöjd).
 * - Om ingen solinfo finns → lämna original orört.
 */
function windowToEvening(timeline, minHours = 6) {
  if (!Array.isArray(timeline) || timeline.length === 0) return timeline;

  const withSun = timeline.map((p, i) => ({
    i,
    sunAlt: getSunAltDegFromPoint(p),
  }));

  const hasAnySun = withSun.some((x) => typeof x.sunAlt === 'number');
  if (!hasAnySun) {
    // Saknar solinfo – returnera original
    return timeline;
  }

  // Filtrera på sol ≤ -6°
  const nightIdx = withSun
    .filter((x) => typeof x.sunAlt === 'number' && x.sunAlt <= -6)
    .map((x) => x.i);

  let idxs = nightIdx;

  // Se till att vi har minst minHours
  if (idxs.length < minHours) {
    // Hitta mörkast timme (lägst solhöjd)
    const darkest = withSun
      .filter((x) => typeof x.sunAlt === 'number')
      .reduce((best, cur) => (cur.sunAlt < best.sunAlt ? cur : best), { i: 0, sunAlt: 999 });

    const center = darkest.i;
    const half = Math.floor(minHours / 2);
    let start = Math.max(0, center - half);
    let end = start + minHours - 1;
    if (end >= timeline.length) {
      end = timeline.length - 1;
      start = Math.max(0, end - minHours + 1);
    }

    idxs = Array.from({ length: end - start + 1 }, (_, k) => start + k);
  }

  const trimmed = idxs.map((i) => timeline[i]);

  // Om api vill bära med tagg om vi kapat → markera (valfritt)
  return trimmed;
}

router.get('/api/evening', async (req, res) => {
  try {
    const useMock = String(req.query.mock || '').toLowerCase() === '1';

    // 1) Hämta inputs (DB eller mock)
    let inputs;
    try {
      inputs = await fetchEveningInputs({ useMock });
    } catch (err) {
      console.error('fetchEveningInputs error', err);
      if (!useMock) {
        // fallback till mock-läge
        inputs = await fetchEveningInputs({ useMock: true });
        console.warn('[evening] DB fel — faller tillbaka till mock:', err?.code || err?.message);
      } else {
        throw err;
      }
    }

    // 2) Bygg payload som tidigare
    let payload = buildEveningPayload(inputs); // { location, now, timeline, observed, meta }

    // 3) Justera tidsfönstret till kvällens timmar (minst 6)
    if (Array.isArray(payload?.timeline) && payload.timeline.length > 0) {
      const trimmed = windowToEvening(payload.timeline, 6);
      payload = { ...payload, timeline: trimmed };
    }

    return res.json(formatApiOk(payload));
  } catch (err) {
    console.error('evening route error', err);
    return res
      .status(500)
      .json(formatApiErr('api.error.internal', { message: err?.message || 'unknown' }));
  }
});
