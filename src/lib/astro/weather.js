import fetch from 'node-fetch';

const API_KEY = process.env.OPENWEATHER_API_KEY;

export async function getWeatherData(lat, lon) {
  if (!lat || !lon) return {};

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}`
    );
    const json = await res.json();

    return {
      cloudiness: json.clouds?.all ?? null,
      temperature: json.main?.temp ?? null,
      windSpeed: json.wind?.speed ?? null,
      weather: json.weather?.[0]?.main ?? null
    };
  } catch (err) {
    console.error('Error fetching weather data:', err);
    return {};
  }
}
