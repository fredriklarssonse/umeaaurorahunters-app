// server/services/mock-data.js
// Enkel mock-generator för kvällens tidslinje

export function makeMockTimeline({ start = new Date(), hours = 9 } = {}) {
  const base = new Date(start);
  base.setMinutes(0, 0, 0);

  const out = [];
  for (let i = 0; i < hours; i++) {
    const ts = new Date(base.getTime() + i * 3600_000);

    // lite varierande värden
    const potential = [0.7, 1.1, 1.5, 1.5, 1.1, 1.1, 1.1, 1.1, 1.1][i % 9] ?? 1.1;
    const visibility = [0.4, 1.0, 4.7, 7.4, 9.0, 9.2, 8.1, 5.8, 2.4][i % 9] ?? 5;

    // moln (0..1)
    const low  = [0.10, 0.07, 0.03, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00][i % 9] ?? 0.1;
    const mid  = [0.00, 0.17, 0.42, 0.55, 0.43, 0.18, 0.00, 0.00, 0.00][i % 9] ?? 0.1;
    const high = [0.00, 0.14, 0.33, 0.48, 0.54, 0.56, 0.52, 0.37, 0.17][i % 9] ?? 0.1;

    // sol/maan (enkel approx för demo)
    const hour = ts.getUTCHours();
    const sunAlt = hour < 18 ? -2 : hour < 20 ? -8 : hour < 22 ? -14 : hour < 24 ? -18 : -12;
    const moonAlt = [-2, -5, -8, -12, -18, -24, -31, -37, -43][i % 9] ?? -10;
    const moonIllum = 0.55 + (i % 4) * 0.01;

    out.push({
      ts: ts.toISOString(),
      potential,
      visibility,
      breakdown: {
        visibility: [
          { code: 'breakdown.twilight', params: { elevationDeg: sunAlt } },
          { code: 'breakdown.moon',     params: { illum: moonIllum, altDeg: moonAlt } },
          { code: 'breakdown.clouds',   params: { low, mid, high } }
        ],
        // valfri "direkt" clouds-struktur som dina canvas-komponenter också kan läsa
        clouds: { low, mid, high }
      }
    });
  }

  return out;
}
