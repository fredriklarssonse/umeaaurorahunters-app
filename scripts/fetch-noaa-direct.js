import { DEFAULT_LOCATION } from '../default-Location.js';
import { fetchSolarWindHistory } from '../aurora/fetch-solar-wind.js';
import { calculateGeomagneticScore } from '../aurora/calculate-geomagnetic-score.js';
import { getMoonData } from '../astro/moon.js';
import { getWeatherData } from '../astro/weather.js';
import { calculateSightability } from '../astro/sightability.js';
import { saveData } from '../db/savedata.js';

import { CONFIG } from '../../config/app-config.js';

const L = CONFIG.solarWind.suspectLimits;

const bad =
  (row.speed   != null && (row.speed < L.speedMin || row.speed > L.speedMax)) ||
  (row.density != null && (row.density < L.densityMin || row.density > L.densityMax)) ||
  (row.bt      != null && Math.abs(row.bt) > L.btAbsMax) ||
  (row.bz      != null && Math.abs(row.bz) > L.bzAbsMax);

async function updateForecast(location = DEFAULT_LOCATION) {
  const history = await fetchSolarWindHistory();
  if (!history.length) return;

  const geomagneticScore = calculateGeomagneticScore(history);

  const moonData = getMoonData(location.lat, location.lon);
  const weatherData = await getWeatherData(location.lat, location.lon);
  const sightability = calculateSightability(geomagneticScore, moonData, weatherData);

  const latest = history[history.length - 1];

  const forecastData = {
    time_tag: latest.time_tag,
    location_name: location.name,
    geomagnetic_score: geomagneticScore,
    sightability_probability: sightability,
    updated_at: new Date().toISOString()
  }
