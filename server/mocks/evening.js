// server/mocks/evening.js
export function buildSimpleMock({ now = new Date(), location }) {
  const base = new Date(now);
  base.setUTCMinutes(0, 0, 0);
  const hours = Array.from({ length: 9 }, (_, i) => {
    const d = new Date(base);
    d.setUTCHours(d.getUTCHours() + i);
    return d.toISOString();
  });

  const timeline = hours.map((ts, i) => ({
    ts,
    potential: [0.7,1.1,1.5,1.5,1.1,1.1,1.1,1.1,1.1][i] ?? 1.1,
    visibility: [0.4,1.0,4.7,7.4,9.0,9.2,8.1,5.8,2.4][i] ?? 3,
    breakdown: {
      visibility: [
        { code: 'breakdown.twilight', params: { elevationDeg: [-1,-7,-12,-15,-17,-17.6,-16.1,-13.0,-8.5][i] ?? -8 } },
        { code: 'breakdown.moon', params: { illum: 0.56, altDeg: [-2,-4,-8,-13,-18,-24,-30,-37,-43][i] ?? -10 } },
        { code: 'breakdown.clouds', params: { low: [0.09,0.07,0.03,0,0,0,0,0,0][i] ?? 0, mid: [0,0.17,0.42,0.55,0.43,0.18,0,0,0][i] ?? 0, high: [0,0.14,0.33,0.48,0.54,0.56,0.52,0.37,0.17][i] ?? 0 } }
      ]
    }
  }));

  return {
    location: { name: location?.name || 'Umeå', lat: location?.lat ?? 63.8258, lon: location?.lon ?? 20.263 },
    now: {
      potential: timeline[2].potential,
      visibility: timeline[3].visibility,
      i18n: { potential: 'forecast.potential.low', visibility: 'forecast.visibility.moderate' }
    },
    timeline,
    observed: [],
    meta: { version: 1, unit: 'score0_10', degraded: true, tag: 'simple-mock-v1' }
  };
}
