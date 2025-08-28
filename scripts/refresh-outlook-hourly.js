import { updateHourlyForecast } from '../src/lib/db/update-hourly-forecast.js';

function parseLocArg(args) {
  if (!args.length) return { loc: 'umea', day: 0 };
  let locInput = 'umea', day = 0;
  const a0 = args[0], a1 = args[1], a2 = args[2];

  const csv = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;
  if (csv.test(a0)) {
    const [lat, lon] = a0.split(',').map(Number);
    locInput = { lat, lon, name: 'Custom' };
    day = a1 ?? 0;
  } else if (args.length >= 2 && !isNaN(parseFloat(a0)) && !isNaN(parseFloat(args[1]))) {
    locInput = { lat: parseFloat(a0), lon: parseFloat(args[1]), name: 'Custom' };
    day = a2 ?? 0;
  } else {
    locInput = a0;
    day = a1 ?? 0;
  }
  return { loc: locInput, day };
}

const { loc, day } = parseLocArg(process.argv.slice(2));
const fmt = (n, d=1) => (n==null ? '—' : Number(n).toFixed(d));
const fmtTime = (iso) => new Intl.DateTimeFormat('sv-SE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Stockholm'}).format(new Date(iso));
const fmtDate = (d) => new Intl.DateTimeFormat('sv-SE',{weekday:'short',year:'numeric',month:'short',day:'2-digit', timeZone:'Europe/Stockholm'}).format(d);

updateHourlyForecast(loc, { day })
  .then(({ location, rows, window }) => {
    const label = (typeof day === 'string') ? day : (day==0?'i kväll':day==1?'i morgon':`+${day} dagar`);
    console.log(`\nTimvis prognos för ${location.name} — ${label}`);
    if (window?.start && window?.end) {
      console.log(`Fönster: ${fmtDate(window.start)} ${fmtTime(window.start)} – ${fmtDate(window.end)} ${fmtTime(window.end)}`);
    }
    if (!rows?.length) { console.log('Inga timmar att visa.'); return; }
    for (const r of rows) {
      const hh = fmtTime(r.hour_start);
      const parts = [
        `Sight=${fmt(r.sightability_expected)}/10`,
        r.clouds_pct==null ? null : `Moln=${r.clouds_pct}%`,
        (r.moon_illum_pct==null||r.moon_alt_deg==null) ? null : `Måne=${r.moon_illum_pct}% @ ${r.moon_alt_deg}°`,
        r.sun_alt_deg==null ? null : `Sol=${r.sun_alt_deg}°`,
        r.light_category ? `Ljus=${r.light_category}${r.light_bortle?`(B${r.light_bortle})`:''}` : null
      ].filter(Boolean);
      console.log(`  ${hh}  ${parts.join('  |  ')}`);
    }
    console.log();
  })
  .catch(e => { console.error(e); process.exitCode = 1; });
