import { LOCATIONS, DEFAULT_LOCATION } from '../db/default-location.js';
import { CONFIG } from '../../config/app-config.js';
import { haversineKm } from '../light/urban-indicator.js'; // redan skapat i din kodbas

function nearestLightZoneKey(lat, lon) {
  const entries = Object.entries(CONFIG.lightZones || {});
  if (!entries.length) return null;
  let best = null, bestD = Infinity;
  for (const [key, def] of entries) {
    const d = haversineKm(lat, lon, def.center.lat, def.center.lon);
    if (d < bestD) { bestD = d; best = key; }
  }
  return best;
}

/**
 * Accepterar:
 *  - { lat, lon, name? }
 *  - 'umea' | 'ostersund' | ...
 * Returnerar { name, lat, lon, keyForZones }
 */
export function resolveLocation(input) {
  // 1) explicit lat/lon
  if (input && typeof input === 'object' && Number.isFinite(input.lat) && Number.isFinite(input.lon)) {
    const name = input.name || 'Custom';
    const keyForZones = nearestLightZoneKey(input.lat, input.lon);
    return { name, lat: input.lat, lon: input.lon, keyForZones };
  }

  // 2) nyckel från LOCATIONS
  if (typeof input === 'string') {
    const key = input.toLowerCase();
    const L = LOCATIONS[key];
    if (L) {
      const keyForZones = key; // samma nyckel för zoner om den finns
      return { name: L.name, lat: L.lat, lon: L.lon, keyForZones };
    }
  }

  // 3) fallback
  const D = DEFAULT_LOCATION;
  return { name: D.name, lat: D.lat, lon: D.lon, keyForZones: 'umea' };
}
