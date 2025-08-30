// repo-migrations/0001_reorg.js
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const root = process.cwd();
const DRY = !process.argv.includes('--apply');

const ensure = async (p) => fsp.mkdir(p, { recursive: true });
const move = async (from, to) => {
  const absFrom = path.join(root, from);
  const absTo   = path.join(root, to);
  if (!fs.existsSync(absFrom)) return { skipped: true, from, to };
  await ensure(path.dirname(absTo));
  if (DRY) return { dry: true, from, to };
  await fsp.rename(absFrom, absTo).catch(async (e) => {
    if (e.code === 'EXDEV') {
      await fsp.copyFile(absFrom, absTo);
      await fsp.unlink(absFrom);
    } else throw e;
  });
  return { moved: true, from, to };
};

const mkdirs = [
  'legacy',
  'src/lib/weather',
  'src/lib/lightpollution',
  'src/lib/aurora',
  'src/lib/astro',
  'src/lib/db',
  'server',
  'repo-migrations'
];

const moves = [
  // DB client (vi ersätter med client-supa.js framåt)
  ['src/lib/db/client.js', 'legacy/db-client.js'],

  // Väder: gamla → legacy
  ['src/lib/astro/weather.js', 'legacy/astro-weather.js'],
  ['src/lib/weather.js',       'legacy/weather.js'],

  // Forecast-logik: äldre filer ut ur vägen
  ['src/lib/db/update-evening-forecast.js', 'legacy/update-evening-forecast.js'],
  ['src/lib/db/update-forecast.js',         'legacy/update-forecast.js'],

  // Serverrutter gamla namn
  ['server/routes-forecast-hourly.js', 'legacy/routes-forecast-hourly.js'],
  ['server/routes-forecast-current.js','legacy/routes-forecast-current.js'],

  // Övrigt
  ['src/lib/locations.js', 'legacy/locations.js']
];

const main = async () => {
  console.log(DRY ? 'Dry-run (inget flyttas)\n' : 'Applying file moves\n');

  for (const d of mkdirs) await ensure(path.join(root, d));

  const results = [];
  for (const [from, to] of moves) results.push(await move(from, to));

  results.forEach(r => {
    if (r.skipped)  console.log('skip ', r.from);
    else if (r.dry) console.log('DRY  ', r.from, '→', r.to);
    else if (r.moved) console.log('move ', r.from, '→', r.to);
  });

  console.log('\nDone.');
};

main().catch(e => { console.error(e); process.exit(1); });
