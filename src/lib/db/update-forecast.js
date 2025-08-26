import { getLightPollution } from '../lightpollution/get-lightpollution.js';
import { fetchSolarWindHistory } from '../aurora/fetch-solar-wind.js';
import { calculateGeomagneticScoreDetailed } from '../aurora/calculate-geomagnetic-score.js';
import { calculateSightabilityDetailed } from '../astro/sightability.js';
import { getMoonData } from '../astro/moon.js';
import { getWeatherData } from '../astro/weather.js';
import { saveData } from './savedata.js';
import { resolveLocation } from '../geo/resolve-location.js';
import { adjustGeomagneticForLatitude } from '../aurora/latitude-adjustment.js';

export async function updateForecast(locationInput = 'umea') {
  const LOC = resolveLocation(locationInput);

  const history = await fetchSolarWindHistory();
  if (!history?.length) return null;

  // Geomagnetik (global)
  const geo = calculateGeomagneticScoreDetailed(history, { windowSize: 6 });

  // Latitud-justera för vald plats
  const latAdj = adjustGeomagneticForLatitude(geo.score, LOC.lat);
  const geoLocalScore = latAdj.adjusted; // det här vill vi visa/spara som "styrka" för denna plats

  // Stale för solvind
  const latest = history.filter(d => !d.suspect_data).slice(-1)[0] || history[history.length - 1];
  const ageHours = (Date.now() - new Date(latest.time_tag).getTime()) / 36e5;
  const stale_status =
    ageHours <= 1  ? 'fresh' :
    ageHours <= 3  ? 'slightly-stale' :
    ageHours <= 12 ? 'stale' :
                     'very-stale';

  // Astro & väder “nu” för platsen
  const moon = getMoonData(LOC.lat, LOC.lon, new Date());
  const weather = await getWeatherData(LOC.lat, LOC.lon);

  const light = await getLightPollution(LOC.lat, LOC.lon, LOC.keyForZones);

  // Sightability (beroende av plats via sol/måne + moln)
  const sight = calculateSightabilityDetailed(geoLocalScore, moon, weather, light);


  // Bygg rad – vi använder platsjusterad styrka i kolumnen geomagnetic_score
  const row = {
    time_tag: latest.time_tag,
    location_name: LOC.name,                          // PK (för “Custom” funkar fint i ditt flöde)
    location: `${LOC.lat.toFixed(5)},${LOC.lon.toFixed(5)}`, // komplement (har UNIQUE med time_tag)
    geomagnetic_score: geoLocalScore,                 // platsjusterad
    sightability_probability: sight.score,
    stale_hours: ageHours,
    stale_status,
    // detaljer i JSONB
    geomagnetic_detail: {
      global: geo,                // opåverkad, inkl breakdown + fönster
      local: {
        adjusted_score: geoLocalScore,
        factor: latAdj.factor,
        latitude: LOC.lat,
        boundary_lat: latAdj.boundaryLat,
        kp_approx: latAdj.kpApprox,
        note: latAdj.label
      }
    },
    sightability_detail: sight,    // breakdown + inputs
    // raw solvind
    bt: latest.bt ?? null,
    bz: latest.bz ?? null,
    by: latest.by ?? null,
    bx: latest.bx ?? null,
    speed: latest.speed ?? null,
    density: latest.density ?? null,
    updated_at: new Date().toISOString()
  };

  await saveData('aurora_forecast_current', [row], ['location_name']);

  return {
    forecast: row,
    location: LOC,
    moon, weather,
    meta: {
      stale_hours: ageHours,
      stale_status,
      geomagnetic: { global: geo, local: row.geomagnetic_detail.local },
      sightability: sight,
      is_daytime: sight.breakdown?.[0]?.label?.startsWith('SOL-GATE') || false
    }
  };
}
