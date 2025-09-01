// server/services/evening-inputs.js
// Adapter-lager för framtida DB-hämtning. Just nu använder vi mock.

import { makeMockTimeline } from './mock-data.js';

export async function fetchEveningInputs({ lat, lon, forceMock = false } = {}) {
  // Här kopplar vi på DB i nästa steg (via server/db/index.js).
  // Tills dess kör vi mock-källa kontrollerat.
  if (forceMock || process.env.FORCE_MOCK === '1') {
    return {
      degraded: true,
      location: { name: 'Umeå', lat, lon },
      timeline: makeMockTimeline({})
    };
  }

  // I ett framtida steg: hämta från DB och returnera samma form
  return {
    degraded: true,
    location: { name: 'Umeå', lat, lon },
    timeline: makeMockTimeline({})
  };
}

export default fetchEveningInputs;
