// server/services/evening-inputs.js
import { dbQuery } from '../db.js';

// Hämta all rådata för "ikväll" från dina tabeller.
// Det här är en *minimal* version – vi använder de kolumner du visat före.
// Du kan fylla på med fler fält senare.
export async function fetchEveningInputs({ lat, lon }) {
  try {
    // Exempel: Umeå med id finns redan; välj tidsfönster från nu och framåt
    const rowsPotential = await dbQuery(
      `
      select hour_start as ts, potential_score10 as potential,
             hp30_median as hp30, hp60_median as hp60, kp_median as kp
      from aurora_potential_hourly
      where hour_start >= date_trunc('hour', now() at time zone 'utc') - interval '2 hour'
      order by hour_start asc
      limit 12
      `
    );

    const rowsWeather = await dbQuery(
      `
      select w.hour_start as ts,
             w.clouds_low, w.clouds_mid, w.clouds_high,
             a.sun_alt_deg as sun_alt_deg,
             a.moon_alt_deg as moon_alt_deg,
             a.moon_illum as moon_illum
      from weather_hourly w
      join astro_hourly a using (hour_start)
      where w.hour_start >= date_trunc('hour', now() at time zone 'utc') - interval '2 hour'
      order by w.hour_start asc
      limit 12
      `
    );

    // Bygg timeline genom att slå ihop på ts
    const byTs = new Map();
    for (const r of rowsPotential.rows) {
      byTs.set(String(r.ts), {
        ts: new Date(r.ts).toISOString(),
        potential: Number(r.potential ?? 0),
        visibility: undefined,
        breakdown: {
          visibility: []
        }
      });
    }
    for (const r of rowsWeather.rows) {
      const key = String(r.ts);
      const item = byTs.get(key) || {
        ts: new Date(r.ts).toISOString(),
        potential: 0,
        visibility: undefined,
        breakdown: {
          visibility: []
        }
      };
      // clouds 0..1
      const clouds = {
        low: norm01(r.clouds_low),
        mid: norm01(r.clouds_mid),
        high: norm01(r.clouds_high)
      };
      item.breakdown.clouds = clouds;
      item.breakdown.visibility.push(
        { code: 'breakdown.clouds', params: clouds },
        { code: 'breakdown.twilight', params: { elevationDeg: num(r.sun_alt_deg) } },
        { code: 'breakdown.moon', params: { altDeg: num(r.moon_alt_deg), illum: num(r.moon_illum) } }
      );
      byTs.set(key, item);
    }

    const timeline = Array.from(byTs.values()).sort((a, b) => a.ts.localeCompare(b.ts));

    return {
      location: { name: 'Umeå', lat, lon },
      now: pickNow(timeline),
      timeline,
      observed: [],
      meta: { version: 1, unit: 'score0_10' }
    };
  } catch (err) {
    // logga HELT fel
    console.error('fetchEveningInputs error', err);
    throw err;
  }
}

function num(x) { return x == null ? undefined : Number(x); }
function norm01(x) {
  if (x == null) return 0;
  const v = Number(x);
  // dina moln var i procent (0..100) i exemplen; om redan 0..1 så skala ej
  if (v > 1) return Math.max(0, Math.min(1, v / 100));
  return Math.max(0, Math.min(1, v));
}

function pickNow(tl) {
  if (!tl || !tl.length) {
    return { potential: 0, visibility: 0, i18n: { potential: 'forecast.potential.very_low', visibility: 'forecast.visibility.very_poor' } };
  }
  const cur = tl[0];
  return {
    potential: Number(cur.potential ?? 0),
    visibility: Number(cur.visibility ?? 0),
    i18n: {
      potential: 'forecast.potential.very_low',
      visibility: 'forecast.visibility.moderate'
    }
  };
}
