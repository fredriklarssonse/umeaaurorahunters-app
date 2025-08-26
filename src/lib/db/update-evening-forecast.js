import { getLightPollution } from '../lightpollution/get-lightpollution.js';
import SunCalc from 'suncalc';
import { calculateGeomagneticScoreDetailed } from '../aurora/calculate-geomagnetic-score.js';
import { calculateSightabilityDetailed } from '../astro/sightability.js';
import { getMoonData } from '../astro/moon.js';
import { getWeatherHourly } from '../astro/weather.js';
import { saveData } from './savedata.js';
import { resolveLocation } from '../geo/resolve-location.js';
import { adjustGeomagneticForLatitude } from '../aurora/latitude-adjustment.js';
import { getLightPollution } from '../lightpollution/get-lightpollution.js'; // NEW


const MAX_WINDOW_HOURS = 4;

const addHours = (d, h) => new Date(d.getTime() + h*3600*1000);
const avg = (arr) => { const v = arr.filter(Number.isFinite); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };

function tonightWindowsSeasonal(lat, lon, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 12, 0, 0);
  const tA = SunCalc.getTimes(today, lat, lon);
  const tB = SunCalc.getTimes(tomorrow, lat, lon);

  const start = tA.nauticalDusk ?? tA.dusk ?? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0, 0);
  const end   = tB.nauticalDawn ?? tB.dawn ?? new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 2, 0, 0);

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 0);

  const earlyStart = start < end ? start : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0);
  const earlyEndRaw = new Date(Math.min(midnight.getTime(), end.getTime()));
  const lateStartRaw = new Date(Math.max(midnight.getTime(), earlyStart.getTime()));
  const lateEnd = end;

  const earlyEnd = new Date(Math.min(earlyEndRaw.getTime(), addHours(earlyStart, MAX_WINDOW_HOURS).getTime()));
  const lateEndCapped = new Date(Math.min(lateEnd.getTime(), addHours(lateStartRaw, MAX_WINDOW_HOURS).getTime()));

  const out = [];
  if (earlyEnd > earlyStart) out.push({ label:'early', startISO: earlyStart.toISOString(), endISO: earlyEnd.toISOString() });
  if (lateEndCapped > lateStartRaw) out.push({ label:'late', startISO: lateStartRaw.toISOString(), endISO: lateEndCapped.toISOString() });
  return out;
}

/**
 * Bygger kvällens prognos för valfri plats (lat/lon).
 * geomagnetic_expected = platsjusterad styrka (inte global).
 */
export async function updateEveningForecast(locationInput = 'umea', historyForToday = []) {
  const LOC = resolveLocation(locationInput);

  // Geomagnetik nu (global) + platsjustering
  const geo = calculateGeomagneticScoreDetailed(historyForToday || [], { windowSize: 6 });
  const latAdj = adjustGeomagneticForLatitude(geo.score, LOC.lat);
  const geoLocal = latAdj.adjusted;

  // Timvis moln för platsen (multi-source)
  const hourly = await getWeatherHourly(LOC.lat, LOC.lon);

  const light = await getLightPollution(LOC.lat, LOC.lon, LOC.keyForZones);


  // Kvällsfönster (säsongsmedvetna)
  const windows = tonightWindowsSeasonal(LOC.lat, LOC.lon, new Date());

  const rows = [];
  for (const w of windows) {
    const tStart = new Date(w.startISO).getTime();
    const tEnd   = new Date(w.endISO).getTime();

    const hoursIn = hourly.filter(h => {
      const t = new Date(h.dt).getTime();
      return t >= tStart && t < tEnd;
    });

    const perHourScores = [];
    for (const h of hoursIn) {
      const when = new Date(h.dt);
      const moon = getMoonData(LOC.lat, LOC.lon, when);

      // sightability drivs av *lokala* förhållanden + platsjusterad geomag
      const sight = calculateSightabilityDetailed(geoLocal, moon, { clouds: h.clouds, cloud_thickness: h.cloud_thickness });
      perHourScores.push({ when: h.dt, score: sight.score, detail: sight });
    }

    const sightAvg = avg(perHourScores.map(x => x.score)) ?? 0;
    const mid = perHourScores[Math.floor(perHourScores.length/2)] || perHourScores[0] || null;

    rows.push({
      location_name: LOC.name,
      window_label: w.label,
      window_start: w.startISO,
      window_end: w.endISO,
      geomagnetic_expected: geoLocal,     // platsjusterat “om det håller i sig”
      kp_expected: Math.round(latAdj.kpApprox), // proxy tills vi kopplar in riktig Kp
      sightability_expected: sightAvg,
      geomagnetic_detail: {
        global: geo,
        local: {
          adjusted_score: geoLocal,
          factor: latAdj.factor,
          latitude: LOC.lat,
          boundary_lat: latAdj.boundaryLat,
          kp_approx: latAdj.kpApprox,
          note: latAdj.label
        }
      },
      sightability_detail: mid?.detail || null,
      // (valfritt) inkludera ljus i detalj för UI
      light_detail: light
    });
  }

  if (rows.length) {
    await saveData('aurora_forecast_outlook', rows, ['location_name', 'window_start']);
  }

  return { location: LOC, rows };
}
