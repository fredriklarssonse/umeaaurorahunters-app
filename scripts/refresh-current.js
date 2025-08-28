// scripts/refresh-current.js
// Exempel:
//   node -r dotenv/config scripts/refresh-current.js umea
//   node -r dotenv/config scripts/refresh-current.js "63.83,20.26"

import { updateForecast } from '../src/lib/db/update-forecast.js';
import { resolveLocationArg, recordLocationUsage } from '../src/lib/locations.js';


function parseArg(argv) {
  return argv[2] || process.env.DEFAULT_LOCATION || 'umea';
}

const arg = parseArg(process.argv);
const loc = await resolveLocationArg(arg); // { id, name, lat, lon }

if (!loc || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lon)) {
  console.error('[refresh-current] Kunde inte slå upp plats/koordinater för:', arg, loc);
  process.exit(1);
}

const row = await updateForecast(loc.name, +loc.lat, +loc.lon).catch(e => {
  console.error('[refresh-current] updateForecast fail:', e?.message || e);
  process.exit(1);
});

await recordLocationUsage(loc.id, 'forecast').catch(()=>{});

console.log(`\nUpdated current forecast for ${loc.name} (${(+loc.lat).toFixed(5)},${(+loc.lon).toFixed(5)})`);
console.log(`  Time tag               : ${row.time_tag}`);
console.log(`  Geomagnetic (local)    : ${row.geomagnetic_score}`);
console.log(`  Sightability           : ${row.sightability_probability}`);
if (row.geomagnetic_detail?.boundary_lat != null) {
  const f = row.geomagnetic_detail?.factor ?? 1;
  const kp = row.geomagnetic_detail?.kp_approx ?? null;
  console.log(`  Lat adj: factor=${f} (boundary ~${row.geomagnetic_detail.boundary_lat}°, kp≈${kp ?? '—'})`);
}
if (row.stale_status) {
  console.log(`  Solar-wind stale       : ${row.stale_hours?.toFixed?.(2)}h (${row.stale_status})`);
}
