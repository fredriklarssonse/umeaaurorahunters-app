// server/data/locationsRepo.js
import { query } from '../db.js';

// För enkelhet: hämta en enabled location närmast lat/lon (om du har PostGIS)
export async function findNearestLocationId({ lat, lon }) {
  // Om du inte har geom/ PostGIS, ersätt med enkel matchning på name = 'Umeå'
  // Här antar vi att geom finns (du listade aurora_locations med geom)
  const sql = `
    SELECT id
    FROM aurora_locations
    WHERE enabled = true
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
    LIMIT 1
  `;
  try {
    const { rows } = await query(sql, [lon, lat]); // ST_MakePoint(lon,lat)
    return rows[0]?.id || null;
  } catch {
    // Fallback om PostGIS saknas eller feilar — HÅRDKODA Umeå som du visade
    return 'bd14b59d-7063-45d1-8bbd-da3dcf2e193a';
  }
}
