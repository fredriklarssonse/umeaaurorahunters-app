// server/services/locations.js
import { one, query } from '../db.js';

/** Hämta default-plats (Umeå) — lagras i aurora_locations */
export async function getDefaultLocation() {
  // Först: explicit lookup på Umeå (om finns)
  const umea = await one(
    `select id, name, lat, lon from aurora_locations
     where enabled = true and lower(name) = lower($1)
     limit 1`,
    ['Umeå']
  );
  if (umea) return umea;

  // Fallback: första enabled
  const row = await one(
    `select id, name, lat, lon from aurora_locations
     where enabled = true
     order by created_at asc
     limit 1`
  );
  return row;
}

/** Hämta plats via id */
export async function getLocationById(id) {
  return one(
    `select id, name, lat, lon
     from aurora_locations
     where id = $1`,
    [id]
  );
}

/** Lista platser (enkelt API) */
export async function listLocations() {
  const { rows } = await query(
    `select id, name, lat, lon, enabled
     from aurora_locations
     order by name asc`
  );
  return rows;
}
