import { updateForecast } from '../src/lib/db/update-forecast.js';
import { updateEveningForecast } from '../src/lib/db/update-evening-forecast.js';

function parseLocArg(args) {
  if (!args.length) return 'umea';
  const a0 = args[0];
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(a0)) {
    const [lat, lon] = a0.split(',').map(Number);
    return { lat, lon, name: 'Custom' };
  }
  if (args.length >= 2 && !isNaN(parseFloat(a0)) && !isNaN(parseFloat(args[1]))) {
    return { lat: parseFloat(a0), lon: parseFloat(args[1]), name: 'Custom' };
  }
  return a0;
}

const locInput = parseLocArg(process.argv.slice(2));
const fmtTime = (iso) => new Intl.DateTimeFormat('sv-SE', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Stockholm' }).format(new Date(iso));

(async () => {
  const cur = await updateForecast(locInput);
  const out = await updateEveningForecast(locInput, []); // geo räknas ändå

  console.log(`\nKvällens prognos för ${cur.location.name} (${cur.forecast.location}):`);
  for (const r of out.rows) {
    const label = r.window_label === 'early' ? 'Tidiga kvällen' : 'Sena kvällen';
    console.log(`  ${label} (${fmtTime(r.window_start)}–${fmtTime(r.window_end)}):`);
    console.log(`    Geomagnetik (lokal/persistens): ${r.geomagnetic_expected?.toFixed?.(1) ?? r.geomagnetic_expected}/10  | Kp (proxy): ${r.kp_expected}`);
    console.log(`    Sightability: ${r.sightability_expected?.toFixed?.(1) ?? r.sightability_expected}/10`);
  }
  console.log();
})().catch(err => { console.error(err); process.exitCode = 1; });
