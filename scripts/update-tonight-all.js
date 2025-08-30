// scripts/update-tonight-all.js
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] ?? null : null; };

const opt = {
  all: has('--all'),
  name: val('--name'),
  lat: val('--lat') ? Number(val('--lat')) : null,
  lon: val('--lon') ? Number(val('--lon')) : null,
  date: val('--date'),
  skipHpo: has('--skip-hpo'),
  skipKp: has('--skip-kp'),
  skipWeather: has('--skip-weather'),
  skipAstro: has('--skip-astro'),
  dry: has('--dry'),
};

function yyyymmddInTZ(tz, d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

function runNode(args, { dry = false, label = '' } = {}) {
  return new Promise((resolve, reject) => {
    const cmd = process.execPath;
    const fullArgs = ['-r', 'dotenv/config', ...args];
    if (dry) { console.log(`[dry] node ${fullArgs.join(' ')}`); return resolve({ code: 0 }); }
    console.log(label ? `[run] ${label}` : `[run] node ${fullArgs.join(' ')}`);
    const child = spawn(cmd, fullArgs, { stdio: 'inherit' });
    child.on('close', (code) => code === 0 ? resolve({ code }) : reject(new Error(`${label || args.join(' ')} exited with code ${code}`)));
  });
}

async function fetchLocations() {
  if (opt.name && Number.isFinite(opt.lat) && Number.isFinite(opt.lon)) {
    return [{ name: opt.name, lat: opt.lat, lon: opt.lon }];
  }
  if (!opt.all) {
    return [{ name: 'Umeå', lat: 63.8258, lon: 20.263 }];
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('[warn] --all angivet men saknar SUPABASE_URL/SUPABASE_SERVICE_KEY; använder Umeå som fallback.');
    return [{ name: 'Umeå', lat: 63.8258, lon: 20.263 }];
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  // Försök med enabled=true; om kolumnen saknas, hämta utan filter.
  let data, error;
  try {
    ({ data, error } = await supabase
      .from('aurora_locations')
      .select('name, lat, lon, enabled')
      .eq('enabled', true)
      .order('name', { ascending: true }));
    if (error && /enabled/.test(String(error.message))) throw error;
  } catch {
    ({ data, error } = await supabase
      .from('aurora_locations')
      .select('name, lat, lon')
      .order('name', { ascending: true }));
  }

  if (error) {
    console.error('[locations] DB-fel:', error);
    return [{ name: 'Umeå', lat: 63.8258, lon: 20.263 }];
  }
  if (!data || data.length === 0) {
    console.warn('[locations] Inga platser; använder Umeå som fallback.');
    return [{ name: 'Umeå', lat: 63.8258, lon: 20.263 }];
  }
  return data.map(r => ({ name: r.name, lat: Number(r.lat), lon: Number(r.lon) }));
}

async function main() {
  const localDate = opt.date || yyyymmddInTZ('Europe/Stockholm');

  console.log('=== update-tonight-all ===');
  console.log(`Date (Europe/Stockholm): ${localDate}`);
  console.log(`Flags: ${JSON.stringify({ skipHpo: opt.skipHpo, skipKp: opt.skipKp, skipWeather: opt.skipWeather, skipAstro: opt.skipAstro, dry: opt.dry })}`);

  if (!opt.skipHpo) {
    await runNode(['scripts/update-hpo-cli.js'], { dry: opt.dry, label: 'HPO → aurora_potential_hourly' });
  } else {
    console.log('[skip] HPO');
  }

  if (!opt.skipKp) {
    await runNode(['-r','dotenv/config','-e',"import('./src/lib/db/update-kp-forecast.js').then(m=>m.updateKpForecastHourly())"], {
      dry: opt.dry, label: 'Kp → aurora_potential_hourly'
    });
  } else {
    console.log('[skip] Kp');
  }

  const locs = await fetchLocations();
  console.log(`[info] Locations: ${locs.map(l => l.name).join(', ')}`);

  for (const loc of locs) {
    const tag = `${loc.name} (${loc.lat},${loc.lon})`;
    if (!opt.skipWeather) {
      await runNode(['scripts/update-weather-cli.js', String(loc.lat), String(loc.lon), loc.name], {
        dry: opt.dry, label: `Weather → weather_hourly: ${tag}`
      });
    } else {
      console.log(`[skip] Weather for ${tag}`);
    }
    if (!opt.skipAstro) {
      await runNode(['scripts/update-astro-cli.js', String(loc.lat), String(loc.lon), loc.name, localDate], {
        dry: opt.dry, label: `Astro → astro_hourly: ${tag} @ ${localDate}`
      });
    } else {
      console.log(`[skip] Astro for ${tag}`);
    }
  }

  console.log('=== DONE ===');
}

main().catch((err) => { console.error('[fatal]', err); process.exit(1); });
