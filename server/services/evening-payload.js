// server/services/evening-payload.js
// Bygger payload (mock eller “skarpt” beroende på flagga)

import { makeMockTimeline } from './mock-data.js';

export async function buildEveningPayload({ lat, lon, locationName = 'Umeå', degraded = false } = {}) {
  // TODO: när DB kopplas på – hämta riktiga tider (astronomisk natt), moln, kp osv.
  // Nu: mockad tidslinje som matchar ditt UI för fortsatt styling
  const now = new Date();
  const timeline = makeMockTimeline({ start: now, hours: 9 });

  const payload = {
    location: { name: locationName, lat, lon },
    now: {
      potential: timeline[2]?.potential ?? 0,
      visibility: timeline[2]?.visibility ?? 0,
      i18n: {
        potential: 'forecast.potential.low',
        visibility: 'forecast.visibility.moderate'
      }
    },
    timeline,
    observed: [],
    meta: {
      version: 1,
      unit: 'score0_10',
      degraded
    }
  };

  if (degraded) payload.meta.tag = 'simple-mock-v1';
  return payload;
}

export default buildEveningPayload;
