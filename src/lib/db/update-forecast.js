import { fetchSolarWindHistory } from './aurora/fetchSolarWind.js';
import { calculateGeomagneticScore } from './aurora/calculateGeomagneticScore.js';
import { getMoonData } from './astro/moon.js';
import { getWeatherData } from './astro/weather.js';
import { calculateSightability } from './astro/sightability.js';
import { saveData } from './db/saveData.js';

const LOCATION = { name: 'Umeå', lat: 63.8258, lon: 20.2630 };

(async () => {
  const dataHistory = await fetchSolarWindHistory();
  if (!dataHistory.length) return;

  await saveData('aurora_solar_wind', dataHistory, ['time_tag']);

  const geomagneticScore = calculateGeomagneticScore(dataHistory);

  const moonData = getMoonData(LOCATION.lat, LOCATION.lon);
  const weatherData = await getWeatherData(LOCATION.lat, LOCATION.lon);

  const sightability = calculateSightability(geomagneticScore, moonData, weatherData);

  const latest = dataHistory[dataHistory.length - 1];
  const forecastData = {
    time_tag: latest.time_tag,
    location_name: LOCATION.name,
    geomagnetic_score: geomagneticScore,
    sightability_probability: sightability,
    updated_at: new Date().toISOString()
  };

  await saveData('aurora_forecast_current', [forecastData], ['time_tag', 'location_name']);

  console.log('Forecast updated:', forecastData);
})();