// server/data/weatherRepo.js
import { query } from '../db.js';

// Moln (0..1 eller 0..100) -> vi normaliserar till 0..1 i service-lagret
export async function getCloudsTimeline({ startUtc, endUtc, locationId }) {
  // Använder weather_hourly (du listade kolumner clouds_low/mid/high)
  const sql = `
    SELECT hour_start as ts, clouds_low, clouds_mid, clouds_high
    FROM weather_hourly
    WHERE location_id = $1 AND hour_start >= $2 AND hour_start <= $3
    ORDER BY hour_start ASC
  `;
  const { rows } = await query(sql, [locationId, startUtc, endUtc]);
  return rows.map(r => ({
    ts: r.ts,
    clouds: {
      low: r.clouds_low != null ? Number(r.clouds_low) : null,
      mid: r.clouds_mid != null ? Number(r.clouds_mid) : null,
      high: r.clouds_high != null ? Number(r.clouds_high) : null,
    }
  }));
}

// Astro (sol & måne) för bakgrund/stjärnor
export async function getAstroTimeline({ startUtc, endUtc, locationId }) {
  // Använder astro_hourly (du listade sun_alt_deg, moon_alt_deg, moon_illum)
  const sql = `
    SELECT hour_start as ts, sun_alt_deg, moon_alt_deg, moon_illum
    FROM astro_hourly
    WHERE location_id = $1 AND hour_start >= $2 AND hour_start <= $3
    ORDER BY hour_start ASC
  `;
  const { rows } = await query(sql, [locationId, startUtc, endUtc]);
  return rows.map(r => ({
    ts: r.ts,
    sun_alt_deg: r.sun_alt_deg != null ? Number(r.sun_alt_deg) : null,
    moon_alt_deg: r.moon_alt_deg != null ? Number(r.moon_alt_deg) : null,
    moon_illum: r.moon_illum != null ? Number(r.moon_illum) : null
  }));
}
