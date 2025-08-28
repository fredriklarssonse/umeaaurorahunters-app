// src/lib/forecast/build-hourly.js
import { CONFIG } from '../../config/app-config.js';
import { calculateSightabilityDetailed } from '../astro/sightability.js';
import { getLightPollution } from '../lightpollution/get-lightpollution.js';
import { getCloudsNow as getCloudsOpenMeteo } from '../weather/get-clouds-now.js';
import { computeEveningWindow } from '../time/evening-window.js';
import { supabase } from '../db/client.js'; // används för hpo/kp om tabeller finns

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

function hoursBetween(start, end) {
  const out = [];
  const cur = new Date(start);
  cur.setMinutes(0, 0, 0);
  if (cur < start) cur.setHours(cur.getHours() + 1);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setHours(cur.getHours() + 1);
  }
  return out;
}

// Försök läsa HPO/Kp om tabeller finns; annars tomma mappar
async function fetchHpoKpMap(utcStartISO, utcEndISO) {
  const map = new Map(); // key hour ISO -> { kp_proxy?, hpo_median?, hpo_max? }

  // HPO
  try {
    const { data } = await supabase
      .from('aurora_hpo_forecast_hourly')
      .select('hour_start, hp60_median, hp60_max')
      .gte('hour_start', utcStartISO)
      .lte('hour_start', utcEndISO);
    for (const r of (data || [])) {
      const key = new Date(r.hour_start).toISOString();
      const prev = map.get(key) || {};
      map.set(key, { ...prev, hpo_median: Number(r.hp60_median ?? r.hp30_median ?? r.hp_median ?? null) || null,
                             hpo_max: Number(r.hp60_max ?? r.hp30_max ?? r.hp_max ?? null) || null });
    }
  } catch (_) { /* tabell saknas, ignorera */ }

  // Kp
  try {
    const { data } = await supabase
      .from('aurora_kp_forecast_hourly')
      .select('hour_start, kp_median, kp_max')
      .gte('hour_start', utcStartISO)
      .lte('hour_start', utcEndISO);
    for (const r of (data || [])) {
      const key = new Date(r.hour_start).toISOString();
      const prev = map.get(key) || {};
      map.set(key, { ...prev, kp_proxy: Number(r.kp_median ?? r.kp ?? null) || null,
                             kp_max: Number(r.kp_max ?? null) || null });
    }
  } catch (_) { /* tabell saknas, ignorera */ }

  return map;
}

export async function buildHourlyForecast({ name, lat, lon, dayOffset = 0 }) {
  if (lat == null || lon == null) throw new Error('buildHourlyForecast requires lat, lon');

  const { start, end } = computeEveningWindow(lat, lon, new Date(), dayOffset);
  const hours = hoursBetween(start, end);

  // Hämta ljusförorening (konstant över fönstret)
  const light = await getLightPollution({ lat, lon });

  // Hämta moln från Open-Meteo (1 anrop) och mappa timmar
  let cloudsArr = null;
  try {
    const base = 'https://api.open-meteo.com/v1/forecast';
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: 'cloudcover',
      // 3 dygn räcker över midnatt och ev. dayOffset
      forecast_days: '3',
      timezone: 'UTC'
    });
    const res = await fetch(`${base}?${params.toString()}`);
    const j = await res.json();
    cloudsArr = (j?.hourly?.time || []).map((t, i) => [new Date(t).toISOString(), Number(j.hourly.cloudcover?.[i])]);
  } catch (e) {
    console.warn('[buildHourly] Open-Meteo fail:', e?.message || e);
  }
  const cloudMap = new Map(cloudsArr || []);

  // HPO/Kp om tillgängligt
  const mapHK = await fetchHpoKpMap(start.toISOString(), end.toISOString());

  const out = [];
  for (const h of hours) {
    const keyISO = new Date(h).toISOString();
    const cloudsPct = cloudMap.get(keyISO) ?? null;

    const hk = mapHK.get(keyISO) || {};
    // kp_proxy (fallback: null)
    const kp_proxy = (hk.kp_proxy != null) ? hk.kp_proxy : null;

    // Global geom-score från kp (0..9 -> 0..10)
    const globalScore10 = (kp_proxy != null) ? (kp_proxy / 9) * 10 : null;

    // Lokal lat-justerad geomagnetik (om kp finns; annars null)
    let geomLocal10 = null, latFactor = null, boundaryLat = null;
    if (globalScore10 != null) {
      const adj = latitudeAdjust(lat, globalScore10, kp_proxy);
      geomLocal10 = adj.local; latFactor = adj.factor; boundaryLat = adj.boundaryLat;
    }

    // Synbarhet (SunCalc inuti)
    const sight = await calculateSightabilityDetailed({
      lat, lon, when: h, cloudsPct,
      geomLocal10: geomLocal10 ?? 0,
      light
    });

    out.push({
      hour_start: keyISO,
      sun_alt_deg: sight.inputs.sunAltitude,
      moon_alt_deg: sight.inputs.moonAltitude,
      moon_illum_pct: Math.round((sight.inputs.moonIllumination ?? 0) * 100),
      clouds_pct: (cloudsPct == null ? null : Math.round(cloudsPct)),
      kp_proxy,
      geomagnetic_local: (geomLocal10 == null ? null : Number(geomLocal10.toFixed(2))),
      lat_factor: latFactor,
      boundary_lat: boundaryLat,
      sightability: Number((sight.score ?? 0).toFixed(2))
    });
  }

  return {
    location: { name, lat, lon },
    window: { start: start.toISOString(), end: end.toISOString() },
    hours: out
  };
}
