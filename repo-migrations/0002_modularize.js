// repo-migrations/0002_modularize.js
// Liten, defensiv “städare” som säkerställer mappstruktur och
// flyttar kända filer dit de hör. Kör med:
//   npm run repo:dry2   (torrkörning)
//   npm run repo:apply2 (gör flytten)

import fs from 'fs/promises';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const ensureDirs = [
  'src/lib/api',
  'src/lib/ui',
  'src/lib/views',
  'src/lib/astro',
  'src/lib/aurora',
  'src/lib/weather',
  'src/lib/lightpollution',
  'src/lib/db',
  'src/lib/config',
  'src/lib/i18n',
  'legacy'
];

const MOVES = [
  // UI & Views (om du har dem i “fel” mappar råkar det rättas till)
  ['src/lib/NowView.svelte',       'src/lib/views/NowView.svelte'],
  ['src/NowView.svelte',           'src/lib/views/NowView.svelte'],
  ['src/lib/ui/Badge.svelte',      'src/lib/ui/Badge.svelte'],
  ['src/lib/ui/ScoreCard.svelte',  'src/lib/ui/ScoreCard.svelte'],
  ['src/lib/ui/BreakdownList.svelte','src/lib/ui/BreakdownList.svelte'],

  // Presenters & API
  ['src/lib/presenters.js',        'src/lib/ui/presenters.js'],
  ['src/presenters.js',            'src/lib/ui/presenters.js'],
  ['src/lib/api/client.js',        'src/lib/api/client.js'],
  ['src/lib/api/current.js',       'src/lib/api/current.js'],

  // Konfig
  ['src/lib/config/frontend-config.js','src/lib/config/frontend-config.js'],

  // Astro / Aurora / Weather / Lightpollution / DB (bara om någon råkat hamna fel)
  ['src/astro/',                   'src/lib/astro/'],
  ['src/aurora/',                  'src/lib/aurora/'],
  ['src/weather/',                 'src/lib/weather/'],
  ['src/lightpollution/',          'src/lib/lightpollution/'],
  ['src/db/',                      'src/lib/db/'],

  // Gamla filer vi vill parkera
  ['src/lib/locations.js',         'legacy/locations.js'],
  ['server/routes-forecast-hourly.js', 'legacy/routes-forecast-hourly.js'],
  ['src/lib/db/update-evening-forecast.js','legacy/update-evening-forecast.js'],
  ['src/lib/db/update-forecast.js',      'legacy/update-forecast.js']
];

const arg = process.argv[2] || '--dry';
const DRY = arg.includes('dry');

async function pathExists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function moveOne(fromRel, toRel) {
  const from = path.join(root, fromRel);
  const to   = path.join(root, toRel);

  const fromIsDir = fromRel.endsWith('/');
  if (fromIsDir) {
    // Flytta alla filer rekursivt om src-katalogen finns
    if (!(await pathExists(from))) return { skipped:true, reason:'missing', from:fromRel, to:toRel };
    // säkerställ dest
    await fs.mkdir(to, { recursive: true });
    // lista
    const stack = [[from, to]];
    while (stack.length) {
      const [srcDir, dstDir] = stack.pop();
      const entries = await fs.readdir(srcDir, { withFileTypes:true });
      for (const e of entries) {
        const s = path.join(srcDir, e.name);
        const d = path.join(dstDir, e.name);
        if (e.isDirectory()) {
          await fs.mkdir(d, { recursive: true });
          stack.push([s, d]);
        } else {
          if (DRY) {
            console.log(`DRY   ${path.relative(root,s)} → ${path.relative(root,d)}`);
          } else {
            await fs.rename(s, d).catch(async (err) => {
              if (err.code === 'EXDEV') { // cross-device fallback
                const buf = await fs.readFile(s);
                await fs.writeFile(d, buf);
                await fs.unlink(s);
              } else throw err;
            });
            console.log(`MOVE  ${path.relative(root,s)} → ${path.relative(root,d)}`);
          }
        }
      }
    }
    return { ok:true, dir:true, from:fromRel, to:toRel };
  } else {
    if (!(await pathExists(from))) return { skipped:true, reason:'missing', from:fromRel, to:toRel };
    await fs.mkdir(path.dirname(to), { recursive: true });
    if (DRY) {
      console.log(`DRY   ${fromRel} → ${toRel}`);
    } else {
      await fs.rename(from, to).catch(async (err) => {
        if (err.code === 'EXDEV') {
          const buf = await fs.readFile(from);
          await fs.writeFile(to, buf);
          await fs.unlink(from);
        } else throw err;
      });
      console.log(`MOVE  ${fromRel} → ${toRel}`);
    }
    return { ok:true, from:fromRel, to:toRel };
  }
}

async function main() {
  if (DRY) console.log('Dry-run (inget flyttas)\n');
  // se till att basmappar finns
  for (const d of ensureDirs) {
    const p = path.join(root, d);
    if (DRY) console.log(`ENSURE ${d}`);
    else await fs.mkdir(p, { recursive: true });
  }
  // gör planerade flyttar
  for (const [from, to] of MOVES) {
    try {
      await moveOne(from, to);
    } catch (e) {
      console.log(`ERR   ${from} → ${to}: ${e.message}`);
    }
  }
  console.log('\nDone.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
