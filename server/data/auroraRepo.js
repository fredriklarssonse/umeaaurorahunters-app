// server/data/auroraRepo.js
import { query } from '../db.js';

// Hämtar "aurora potential" per timme (0..10)
export async function getAuroraTimeline({ startUtc, endUtc, locationId }) {
  // Minimalt exempel — justera SELECT/kolumner efter din schema
  // För demo använder vi aurora_potential_hourly som du listade
  const sql = `
    SELECT hour_start as ts, potential_score10 as potential
    FROM aurora_potential_hourly
    WHERE hour_start >= $1 AND hour_start <= $2
    ORDER BY hour_start ASC
  `;
  const { rows } = await query(sql, [startUtc, endUtc]);
  return rows.map(r => ({
    ts: r.ts,
    potential: r.potential != null ? Number(r.potential) : null
  }));
}

// Hämtar "observed" (om du har något mätvärde) – lämnas tomt tills vidare
export async function getObserved({ startUtc, endUtc, locationId }) {
  return [];
}
