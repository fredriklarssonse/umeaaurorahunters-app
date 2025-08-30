// src/lib/locations.js
// DB-drivna locations + popularitet. Kräver tabellerna som vi skapade tidigare:
// - public.aurora_locations
// - public.aurora_location_events
// - view public.v_location_popularity

import { saveData } from './db/savedata.js';

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
const HDRS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const R_EARTH_KM = 6371;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const toNum = (v) => (Number.isFinite(+v) ? +v : null);

function parseLatLonArg(arg) {
  const m = String(arg ?? '').trim().match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/);
  return m ? { lat: +m[1], lon: +m[3] } : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(a));
}

async function fetchJson(url) {
  if (!BASE || !KEY) throw new Error('Missing SUPABASE_URL or API key');
  const r = await fetch(url, { headers: HDRS });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

/** Fuzzy-sök på namn → bästa träff (mest populär senaste 30 dgr) */
export async function findLocationByName(name) {
  if (!name) return null;
  const q = encodeURIComponent(`*${name}*`);
  const url = `${BASE}/rest/v1/v_location_popularity?name=ilike.${q}&order=events_30d.desc,events_total.desc&limit=5`;
  const rows = await fetchJson(url).catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** Hitta närmaste plats inom radiusKm */
export async function findNearestLocation(lat, lon, radiusKm = 50) {
  lat = toNum(lat); lon = toNum(lon);
  if (lat == null || lon == null) return null;

  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180) || 1);
  const url = `${BASE}/rest/v1/aurora_locations`
    + `?lat=gte.${(lat - dLat)}&lat=lte.${(lat + dLat)}`
    + `&lon=gte.${(lon - dLon)}&lon=lte.${(lon + dLon)}`
    + `&select=*&limit=200`;
  const rows = await fetchJson(url).catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return null;
  rows.sort((a,b) => haversineKm(lat,lon,a.lat,a.lon) - haversineKm(lat,lon,b.lat,b.lon));
  return rows[0];
}

/** Skapa plats om nödvändigt (fix: använd ['id'] i saveData för att inte skicka tom on_conflict) */
export async function upsertLocation({ name, lat, lon, source = 'user' }) {
  lat = toNum(lat); lon = toNum(lon);
  if (lat == null || lon == null) throw new Error('upsertLocation: invalid lat/lon');

  // Redan befintlig (inom 0.3 km) med samma namn?
  const existing = await findNearestLocation(lat, lon, 0.3);
  if (existing && existing.name?.toLowerCase() === String(name||'').toLowerCase()) return existing;

  const row = {
    name: name || `${lat.toFixed(5)},${lon.toFixed(5)}`,
    lat, lon,
    source
  };

  // Viktigt: ['id'] undviker tomt on_conflict= i PostgREST
  await saveData('aurora_locations', [row], ['id']);
  return (await findNearestLocation(lat, lon, 0.3)) || row;
}

/** Tolka CLI-arg → location-objekt med id,name,lat,lon. Skapa vid behov. */
export async function resolveLocationArg(arg) {
  // 1) lat,lon direkt?
  const ll = parseLatLonArg(arg);
  if (ll) {
    return await upsertLocation({ name: `${ll.lat.toFixed(5)},${ll.lon.toFixed(5)}`, ...ll, source: 'cli' });
  }
  // 2) namn (fuzzy)
  const byName = await findLocationByName(arg);
  if (byName) return byName;

  // 3) fallback: Umeå (skapad om saknas)
  return await upsertLocation({ name: 'Umeå', lat: 63.8258, lon: 20.2630, source: 'system' });
}

/** Logga användning för popularitet */
export async function recordLocationUsage(locationId, event = 'forecast') {
  if (!locationId) return;
  await saveData('aurora_location_events', [{ location_id: locationId, event }], ['id']);
}

/** Populära platser nära lat/lon */
export async function getPopularNearby(lat, lon, { radiusKm = 50, limit = 10 } = {}) {
  lat = toNum(lat); lon = toNum(lon);
  if (lat == null || lon == null) return [];
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180) || 1);
  const url = `${BASE}/rest/v1/v_location_popularity`
    + `?lat=gte.${(lat - dLat)}&lat=lte.${(lat + dLat)}`
    + `&lon=gte.${(lon - dLon)}&lon=lte.${(lon + dLon)}`
    + `&select=*`;
  const rows = await fetchJson(url).catch(() => []);
  for (const r of rows) r.distance_km = haversineKm(lat, lon, r.lat, r.lon);
  rows.sort((a, b) => (b.events_30d - a.events_30d) || (a.distance_km - b.distance_km));
  return rows.slice(0, limit);
}
