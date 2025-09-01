// server/services/locations.js
import { one, query } from '../db/client.js';

/** Hämtar första aktiverade plats (fallback: Umeå) */
export async function getDefaultLocation() {
  const rows = await query(
    `SELECT id, name, lat, lon
     FROM public.aurora_locations
     WHERE enabled = true
     ORDER BY created_at ASC
     LIMIT 1`
  );
  if (rows.length) return rows[0];
  return { id: null, name: 'Umeå', lat: 63.8258, lon: 20.263 };
}

/** Hitta närmaste location via lat/lon (PostGIS) */
export async function getNearestLocation({ lat, lon }) {
  const sql = `
    SELECT id, name, lat, lon
    FROM public.aurora_locations
    WHERE enabled = true
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
    LIMIT 1
  `;
  return await one(sql, [lon, lat]);
}
