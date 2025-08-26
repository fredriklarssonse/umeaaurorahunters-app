import { CONFIG } from '../../config/app-config.js';
import { resolveLocation } from '../geo/resolve-location.js';
import { getWeatherHourly } from '../astro/weather.js';
import { getMoonData } from '../astro/moon.js';
import { calculateSightabilityDetailed } from '../astro/sightability.js';
import { calculateGeomagneticScoreDetailed } from '../aurora/calculate-geomagnetic-score.js';
import { adjustGeomagneticForLatitude } from '../aurora/latitude-adjustment.js';
import { getLightPollution } from '../lightpollution/get-lightpollution.js';
import { fetchSolarWindHistory } from '../aurora/fetch-solar-wind.js';

// enkel PostgREST-klient (återanvänd env som saveData använder)
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

async function restGet(pathAndQuery) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or key env vars');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'accept-profile': 'public',
    }
  });
  if (!res.ok) throw new Error(`${pathAndQuery} -> ${res.status}`);
  return res.json();
}

// Anropa SQL-funktionen via RPC (supabase rest)
async function getPublicSpotsWithin(lat, lon, radiusKm) {
  // PostgREST RPC format: /rpc/function_name
  const url = `rpc/get_spots_within`;
  const body = { q_lat: lat, q_lon: lon, radius_km: radiusKm };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${url}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json(); // [{id,name,lat,lon,distance_km,popularity_score}]
}

const clamp01 = (x) => x == null ? 0 : Math.max(0, Math.min(1, x));

export async function suggestCommunitySpots(locationInput = 'umea') {
  const cfg = CONFIG.spotCommunity;
  const LOC = resolveLocation(locationInput);

  // 1) Hämta candidates (offentliga spots inom radie)
  const candidates = await getPublicSpotsWithin(LOC.lat, LOC.lon, cfg.searchRadiusKm);
  if (!candidates?.length) return [];

  // 2) Förberedd geomagnetik (global -> lokalt justerat)
  const history = await fetchSolarWindHistory();
  const geo = calculateGeomagneticScoreDetailed(history, { windowSize: 6 });
  const latAdj = adjustGeomagneticForLatitude(geo.score, LOC.lat);
  const geoLocal = latAdj.adjusted;

  // 3) Scora varje spot
  const out = [];
  for (const s of candidates) {
    const lat = Number(s.lat), lon = Number(s.lon);

    // weather/light för spot
    const hourly = await getWeatherHourly(lat, lon);
    const now = new Date();
    const moon = getMoonData(lat, lon, now);
    const light = await getLightPollution(lat, lon, LOC.keyForZones);

    // ta närmsta timme som “nu”
    const next = hourly.find(h => new Date(h.dt).getTime() >= now.getTime()) || hourly[hourly.length-1];
    const weatherNow = next ? { clouds: next.clouds, cloud_thickness: next.cloud_thickness } : { clouds: null };

    // sightability med lokalt justerad geomagnetik + light
    const sight = calculateSightabilityDetailed(geoLocal, moon, weatherNow, light);

    // komponenter till 0..1 för ranking
    const sightN = clamp01(sight.score / CONFIG.sightability.maxScore);
    const lightN = clamp01((light?.category === 'rural' ? 1 : light?.category === 'rural_edge' ? 0.8 :
                            light?.category === 'suburban' ? 0.5 : light?.category === 'urban_edge' ? 0.25 :
                            light?.category === 'urban_core' ? 0.1 : 0.5));
    const distN = 1 - clamp01((s.distance_km || cfg.distanceKmMax) / cfg.distanceKmMax);
    const popN  = clamp01((s.popularity_score || 0) / 1.0); // skala efter hur du vill

    const score =
      cfg.weights.sightability * sightN +
      cfg.weights.light        * lightN +
      cfg.weights.distance     * distN +
      cfg.weights.popularity   * popN;

    out.push({
      id: s.id,
      name: s.name,
      lat, lon,
      distance_km: Math.round((s.distance_km + Number.EPSILON) * 10) / 10,
      score: Math.round((score + Number.EPSILON) * 100) / 100,
      components: { sightN, lightN, distN, popN },
      sightability: sight.score,
      light_category: light?.category || null,
      light_bortle: light?.bortle || null,
      clouds_pct: weatherNow.clouds,
      meta: {
        geomagnetic_local: geoLocal,
        light_source: light?.source || null
      }
    });
  }

  // 4) sortera och skär
  out.sort((a,b)=> b.score - a.score);
  return out.slice(0, cfg.topN);
}
