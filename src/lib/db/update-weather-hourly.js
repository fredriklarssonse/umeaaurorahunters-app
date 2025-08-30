// src/lib/db/update-weather-hourly.js
import { dbUpsert } from './client-supa.js';
import { resolveLocation } from '../locations/resolve-location.js';

const HOURS = 48; // ~2 dygn

export async function updateWeatherHourly({ lat, lon, name }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('updateWeatherHourly: invalid lat/lon');
  }

  // 1) Hitta/skapa plats (kanonisk)
  const loc = await resolveLocation({ lat, lon, name }); // { id, name, lat, lon }

  // 2) Hämta Open-Meteo low/mid/high
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
              `&hourly=cloudcover_low,cloudcover_mid,cloudcover_high&forecast_days=3&timezone=UTC`;

  const rsp = await fetch(url);
  if (!rsp.ok) throw new Error(`[Open-Meteo] ${rsp.status}`);
  const json = await rsp.json();
  const t = json?.hourly?.time || [];
  const low = json?.hourly?.cloudcover_low || [];
  const mid = json?.hourly?.cloudcover_mid || [];
  const high = json?.hourly?.cloudcover_high || [];

  // 3) Bygg rader
  const rows = [];
  for (let i = 0; i < t.length && i < HOURS; i++) {
    const hour_start = new Date(t[i]).toISOString(); // hel timme
    rows.push({
      hour_start,
      location_name: loc.name,    // <= upsert-nyckel
      location_id: loc.id,        // <= fylls för framtida queries
      clouds_low: Number.isFinite(+low[i]) ? +low[i] : null,
      clouds_mid: Number.isFinite(+mid[i]) ? +mid[i] : null,
      clouds_high: Number.isFinite(+high[i]) ? +high[i] : null,
      fog_prob: null,
      consensus_diff: 0
    });
  }
  if (!rows.length) throw new Error('Open-Meteo gav inga timmar');

  // 4) UPSERT mot legacy-PK för att undvika krockar nu
  await dbUpsert('weather_hourly', rows, 'location_name,hour_start');

  return { count: rows.length, location: { id: loc.id, name: loc.name, lat, lon } };
}

// CLI-exempel:
// node -r dotenv/config -e "import('./src/lib/db/update-weather-hourly.js').then(m=>m.updateWeatherHourly({lat:63.8258,lon:20.263,name:'Umeå'}))"
