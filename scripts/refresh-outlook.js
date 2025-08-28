// scripts/refresh-outlook.js
// Exempel:
//   node -r dotenv/config scripts/refresh-outlook.js umea
//   node -r dotenv/config scripts/refresh-outlook.js "63.83,20.26" --day=tomorrow
import { updateHourlyForecast } from '../src/lib/db/update-hourly-forecast.js';
import { resolveLocationArg, recordLocationUsage, getPopularNearby } from '../src/lib/locations.js';


const TZ = 'Europe/Stockholm';

function parseDay(argv) {
  const arg = argv.find(a => a === 'tomorrow' || a === 'tonight') ||
              (argv.find(a => a.startsWith('--day=')) || '').split('=')[1];
  return arg === 'tomorrow' ? 'tomorrow' : 'tonight';
}
function fmtIso(iso) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(iso));
}

const argv = process.argv.slice(2);
const locArg = argv[0] || process.env.DEFAULT_LOCATION || 'umea';
const day = parseDay(argv);

const loc = await resolveLocationArg(locArg); // {id,name,lat,lon}
const res = await updateHourlyForecast(loc.name, loc.lat, loc.lon, { day });

await recordLocationUsage(loc.id, 'forecast');

console.log(`Timvis prognos uppdaterad för ${loc.name} (${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}) — ${day}`);
if (res.hours?.length) {
  console.log(`Fönster: ${fmtIso(res.hours[0])} – ${fmtIso(res.hours[res.hours.length-1])}  (${res.hours.length} tim.)`);
}
console.log(`Saved ${res.rowsSaved} rows to aurora_forecast_outlook_hourly`);

// (Bonus) visa 5 populära spots nära platsen
const nearby = await getPopularNearby(loc.lat, loc.lon, { radiusKm: 60, limit: 5 });
if (nearby.length) {
  console.log('\nPopulära spots nära dig (≤60 km):');
  for (const r of nearby) {
    console.log(`  - ${r.name}  (${r.distance_km.toFixed(1)} km)  · events_30d=${r.events_30d}`);
  }
}
