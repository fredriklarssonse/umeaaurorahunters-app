import fetch from 'node-fetch'; // använd alltid node-fetch i Node

export async function fetchSolarWindData() {
  try {
    const url = 'https://services.swpc.noaa.gov/json/ace/solar_wind.json';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NOAA fetch failed: ${res.status}`);

    const data = await res.json();
    const latest = data[data.length - 1];

    return {
      bz: parseFloat(latest.bz_gsm),
      bt: parseFloat(latest.bt),
      by: parseFloat(latest.by_gsm),
      hastighet: parseFloat(latest.speed),
      densitet: parseFloat(latest.density)
    };
  } catch (err) {
    console.error('Error fetching solar wind data:', err.stack || err);
    throw err;
  }
}