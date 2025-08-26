import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ---------- Beräkna geomagnetic score ----------
function calculateGeomagneticScoreFromHistory(dataHistory) {
  if (!dataHistory || dataHistory.length === 0) return 0;

  const filtered = dataHistory.filter(d =>
    d.density >= 0 && d.density <= 50 &&
    d.speed >= 100 && d.speed <= 2000 &&
    Math.abs(d.bt) <= 100 &&
    Math.abs(d.bz) <= 100
  );

  if (filtered.length === 0) return 0;

  filtered.sort((a, b) => new Date(a.time_tag) - new Date(b.time_tag));

  let score = 0;

  // BT
  const btAvg = filtered.reduce((sum, d) => sum + d.bt, 0) / filtered.length;
  if (btAvg >= 20) score += 4;
  else if (btAvg >= 10) score += 3;
  else if (btAvg >= 3) score += 2;

  // BZ
  let bzNegativeDuration = 0;
  let bzSum = 0;
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const curr = filtered[i];
    const diffMin = (new Date(curr.time_tag) - new Date(prev.time_tag)) / 60000;
    if (curr.bz < 0) bzNegativeDuration += diffMin;
    bzSum += curr.bz;
  }
  const bzAvg = bzSum / filtered.length;
  const bzMin = Math.min(...filtered.map(d => d.bz));

  if (bzNegativeDuration >= 240) score += 3;
  else if (bzNegativeDuration >= 120) score += 2;
  else if (bzNegativeDuration >= 30) score += 1;

  if (bzMin <= -20) score += 2;
  else if (bzMin <= -10) score += 1;

  if (bzAvg > 0) score -= 1;

  // Densitet och hastighet
  const speedAvg = filtered.reduce((sum, d) => sum + d.speed, 0) / filtered.length;
  const densityAvg = filtered.reduce((sum, d) => sum + d.density, 0) / filtered.length;

  if (speedAvg > 500 && densityAvg > 5) score += 2;
  else if (speedAvg > 500 || densityAvg > 5) score += 1;
  else if (speedAvg < 400 && btAvg < 10) score -= 1;

  if (score > 10) score = 10;
  if (score < 0) score = 0;

  return score;
}

// ---------- Hämta NOAA-data ----------
async function fetchNoaaData() {
  try {
    const magRes = await fetch('https://services.swpc.noaa.gov/json/ace/mag/ace_mag_1h.json');
    const magData = await magRes.json();

    const swepamRes = await fetch('https://services.swpc.noaa.gov/json/ace/swepam/ace_swepam_1h.json');
    const swepamData = await swepamRes.json();

    // Matcha tidsstämplar
    const latestMag = magData[magData.length - 1];
    const latestSwepam = swepamData[swepamData.length - 1];

    return {
      time_tag: latestMag.time_tag,
      bx: latestMag.gsm_bx,
      by: latestMag.gsm_by,
      bz: latestMag.gsm_bz,
      bt: latestMag.bt,
      speed: latestSwepam.speed,
      density: latestSwepam.density
    };
  } catch (error) {
    console.error('Error fetching NOAA data:', error);
    return null;
  }
}

// ---------- Spara solvind-data med batch insert ----------
async function saveSolarWind(data) {
  if (!data) return;

  // Kolla om raden redan finns
  const { data: existing, error: fetchError } = await supabase
    .from('aurora_solar_wind')
    .select('time_tag')
    .eq('time_tag', data.time_tag);

  if (fetchError) {
    console.error('Error checking existing rows:', fetchError);
    return;
  }

  if (existing.length === 0) {
    const { error } = await supabase
      .from('aurora_solar_wind')
      .insert([data]); // batch insert med en rad just nu
    if (error) console.error('Error saving solar wind data:', error);
    else console.log('Solar wind data saved:', data.time_tag);
  } else {
    console.log('Row already exists, skipping:', data.time_tag);
  }
}

// ---------- Uppdatera aurora_forecast_current ----------
async function updateForecastCurrent() {
  // Hämta historik senaste 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: history, error } = await supabase
    .from('aurora_solar_wind')
    .select('*')
    .gte('time_tag', since)
    .order('time_tag', { ascending: true });

  if (error) {
    console.error('Error fetching history:', error);
    return;
  }

  const score = calculateGeomagneticScoreFromHistory(history);
  const latest = history[history.length - 1] || {};

  const forecastData = {
    time_tag: latest.time_tag,
    location: 'default', // default location
    location_name:'Umeå',
    bt: latest.bt,
    bz: latest.bz,
    by: latest.by,
    bx: latest.bx,
    speed: latest.speed,
    density: latest.density,
    geomagnetic_score: score
  };

  const { error: upsertError } = await supabase
    .from('aurora_forecast_current')
    .upsert([forecastData], { onConflict: ['time_tag', 'location'] });

  if (upsertError) console.error('Error updating forecast_current:', upsertError);
  else console.log('Forecast current updated with geomagnetic score:', score);
}

// ---------- Huvudfunktion ----------
(async () => {
  console.log('Fetching NOAA solar wind data...');
  const data = await fetchNoaaData();
  if (!data) return;

  await saveSolarWind(data);
  await updateForecastCurrent();
})();