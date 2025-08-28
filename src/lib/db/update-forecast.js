// src/lib/db/update-forecast.js
import { supabase } from './client.js';
import { calculateSightabilityDetailed } from '../astro/sightability.js';
import { CONFIG } from '../../config/app-config.js';
import { getLightPollution } from '../lightpollution/get-lightpollution.js';
import { getCloudsNow } from '../weather/get-clouds-now.js';

// ---- utils ----
const clamp10 = (x) => Math.max(0, Math.min(10, x));

function interp(x, x0, x1, y0, y1) {
  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

function boundaryLatForKp(kp) {
  const tbl = CONFIG?.auroralOval?.kpBoundaryLat || { 0: 67, 1: 66, 2: 64, 3: 62, 4: 60, 5: 58, 6: 56, 7: 54, 8: 52, 9: 50 };
  const k = Math.max(0, Math.min(9, kp ?? 0));
  const k0 = Math.floor(k), k1 = Math.ceil(k);
  const b0 = tbl[k0] ?? 67, b1 = tbl[k1] ?? tbl[k0] ?? 67;
  if (k0 === k1) return b0;
  const t = (k - k0) / (k1 - k0);
  return b0 + t * (b1 - b0);
}

function latitudeAdjust(localLatDeg, globalScore10, kpProxy) {
  const falloff = CONFIG?.auroralOval?.falloffDeg ?? 10;
  const boundary = boundaryLatForKp(kpProxy ?? 0);
  const diff = boundary - (localLatDeg ?? boundary);
  const factor = Math.max(0, Math.min(1, 1 - diff / falloff));
  const local = clamp10((globalScore10 ?? 0) * factor);
  return { local, factor, boundaryLat: boundary };
}

// ---- senaste rader ----
async function getLatestSolarWind() {
  const { data, error } = await supabase
    .from('aurora_solar_wind')
    .select('time_tag, bt, bz, by, bx, speed, density')
    .order('time_tag', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getLatestGeomNow() {
  const { data, error } = await supabase
    .from('aurora_geomagnetic_now')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// ---- huvud ----
export async function updateForecast(locationName, lat, lon) {
  if (locationName == null || lat == null || lon == null) {
    throw new Error('updateForecast requires (locationName, lat, lon)');
  }

  // 1) Tid = NU
  const now = new Date();

  // 2) Global geomagnetik → lokal justering
  const geomNow = await getLatestGeomNow();
  const kpProxy = geomNow?.kp_proxy ?? null;
  const globalScore10 = geomNow?.global_score ?? 0;

  const { local: localGeom10, factor: latFactor, boundaryLat } =
    latitudeAdjust(lat, globalScore10, kpProxy ?? 0);

  // 3) Light-pollution (kan bli null → UI visar “unknown”)
  let light = null;
  try {
    light = await getLightPollution({ lat, lon });
  } catch (e) {
    console.warn('[updateForecast] lightpollution fail:', e?.message || e);
  }

  // 4) Moln NU via Open-Meteo
  let cloudsPct = null;
  try {
    const c = await getCloudsNow({ lat, lon, when: now });
    cloudsPct = c?.cloudsPct ?? null;
  } catch (e) {
    console.warn('[updateForecast] clouds-now fail:', e?.message || e);
  }

  // 5) Sightability (NU) – SunCalc används inuti sightability.js
  const sight = await calculateSightabilityDetailed({
    lat, lon, when: now,
    cloudsPct,
    geomLocal10: localGeom10,
    light
  });

  // 6) Senaste solvind för att fylla fält i current
  const sw = await getLatestSolarWind();

  // 7) Spara current (time_tag = now)
  const payload = {
    location_name: locationName,
    kp_now: kpProxy,
    geomagnetic_score: localGeom10,
    sightability_probability: sight?.score ?? 0,
    updated_at: new Date().toISOString(),

    time_tag: now.toISOString(),
    location: `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`,

    bt: sw?.bt ?? null,
    bz: sw?.bz ?? null,
    by: sw?.by ?? null,
    bx: sw?.bx ?? null,
    speed: sw?.speed ?? null,
    density: sw?.density ?? null,

    // Light: prioritera detail.category om den finns och inte är "unknown"
    light_source: light?.source ?? null,
    light_category: (
      (light?.detail?.category && light.detail.category !== 'unknown')
        ? light.detail.category
        : (light?.category ?? null)
    ),
    light_bortle: (light?.detail?.bortle ?? light?.bortle ?? null),
    light_radiance: light?.radiance ?? null,

    geomagnetic_detail: {
      factor: latFactor,
      boundary_lat: boundaryLat,
      kp_approx: kpProxy ?? 0,
      global_score: globalScore10
    },
    sightability_detail: sight ?? null,

    stale_hours: geomNow?.stale_hours ?? null,
    stale_status: geomNow?.stale_status ?? null
  };

  const { error: upErr } = await supabase
    .from('aurora_forecast_current')
    .upsert(payload, { onConflict: 'location_name' })
    .select()
    .maybeSingle();

  if (upErr) {
    console.error('[updateForecast] upsert error:', upErr);
    throw upErr;
  }

  return {
    location: { name: locationName, lat, lon },
    when: now,
    kpProxy,
    globalScore10,
    localGeom10,
    light,
    sight
  };
}

export default { updateForecast };
