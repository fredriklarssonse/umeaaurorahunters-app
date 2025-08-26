import { DEFAULT_LOCATION } from '../defaultLocation.js';
import { fetchSolarWindHistory } from '../aurora/fetchSolarWind.js';
import { calculateGeomagneticScore } from '../aurora/calculateGeomagneticScore.js';
import { getMoonData } from '../astro/moon.js';
import { getWeatherData } from '../astro/weather.js';
import { calculateSightability } from '../astro/sightability.js';
import { saveData } from '../db/saveData.js';

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
