// scripts/update-weather-cli.js
import { updateWeatherHourly } from '../src/lib/db/update-weather-hourly.js';

const lat = Number(process.argv[2] ?? 63.8258);
const lon = Number(process.argv[3] ?? 20.263);
const name = process.argv[4] ?? 'Umeå';

(async () => {
  try {
    const r = await updateWeatherHourly({ lat, lon, name });
    console.log('OK:', r);
  } catch (e) {
    // Visa allt som är användbart från Supabase/fetch
    console.error('ERR:', {
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
      status: e?.status,
      name: e?.name
    });
    process.exit(1);
  }
})();
