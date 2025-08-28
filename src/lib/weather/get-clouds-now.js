// src/lib/weather/get-clouds-now.js
// Hämtar närmaste timmes molntäcke (%) för given plats/tid från Open-Meteo.
export async function getCloudsNow({ lat, lon, when = new Date() }) {
  if (lat == null || lon == null) throw new Error('getCloudsNow requires lat, lon');

  const base = 'https://api.open-meteo.com/v1/forecast';
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'cloudcover',
    forecast_days: '2',
    timezone: 'UTC'
  });
  const url = `${base}?${params.toString()}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);

  const j = await r.json();
  const times = j?.hourly?.time;
  const values = j?.hourly?.cloudcover;
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) {
    return null;
  }

  const target = (when instanceof Date) ? when : new Date(when);
  let bestIdx = 0, bestDif = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    const dif = Math.abs(t - target.getTime());
    if (dif < bestDif) { bestDif = dif; bestIdx = i; }
  }

  return {
    cloudsPct: Number(values[bestIdx]),
    matchedTime: times[bestIdx],
    source: 'open-meteo'
  };
}

export default { getCloudsNow };
