import { updateForecast } from '../src/lib/db/update-forecast.js';

function parseLocArg(args) {
  // Stöd: node script.js umea  |  node script.js 63.83 20.27  |  node script.js "63.83,20.27"
  if (!args.length) return 'umea';
  const a0 = args[0];
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(a0)) {
    const [lat, lon] = a0.split(',').map(Number);
    return { lat, lon, name: 'Custom' };
  }
  if (args.length >= 2 && !isNaN(parseFloat(a0)) && !isNaN(parseFloat(args[1]))) {
    return { lat: parseFloat(a0), lon: parseFloat(args[1]), name: 'Custom' };
  }
  return a0; // locKey
}

const locInput = parseLocArg(process.argv.slice(2));

updateForecast(locInput)
  .then(result => {
    if (!result) {
      console.error('No data to update.');
      process.exitCode = 2;
      return;
    }
    const { forecast, location, meta } = result;

    console.log(`\nUpdated current forecast for ${location.name} (${forecast.location})`);
    console.log(`  Time tag               : ${forecast.time_tag}`);
    console.log(`  Geomagnetic (local)    : ${forecast.geomagnetic_score}`);
    console.log(`  Sightability           : ${forecast.sightability_probability}`);
    if (meta?.geomagnetic?.local) {
      const l = meta.geomagnetic.local;
      console.log(`  Lat adj: factor=${l.factor.toFixed(2)} (boundary ~${l.boundary_lat.toFixed(1)}°, kp≈${l.kp_approx.toFixed(1)})`);
    }
    if (meta?.stale_hours != null && meta?.stale_status) {
      console.log(`  Solar-wind stale       : ${meta.stale_hours.toFixed(1)}h (${meta.stale_status})`);
    }

    // Sightability breakdown
    if (meta?.sightability?.breakdown?.length) {
      console.log('\nSightability breakdown:');
      for (const p of meta.sightability.breakdown) {
        const sign = p.contribution >= 0 ? '+' : '';
        console.log(`  ${sign}${p.contribution}  ${p.label}`);
      }
    }
    console.log();
  })
  .catch(err => { console.error(err); process.exitCode = 1; });
