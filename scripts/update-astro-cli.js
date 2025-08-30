// scripts/update-astro-cli.js
// Användning:
//   node -r dotenv/config scripts/update-astro-cli.js <lat> <lon> "<Name>" [YYYY-MM-DD]
// Exempel:
//   node -r dotenv/config scripts/update-astro-cli.js 63.8258 20.263 "Umeå" 2025-08-30

import { upsertAstroHourly } from '../src/lib/db/upsert-astro-hourly.js';

async function main() {
  const [latStr, lonStr, ...rest] = process.argv.slice(2);
  if (!latStr || !lonStr || rest.length === 0) {
    console.error('Usage: node -r dotenv/config scripts/update-astro-cli.js <lat> <lon> "<Name>" [YYYY-MM-DD]');
    process.exit(1);
  }
  const lat = Number(latStr);
  const lon = Number(lonStr);
  const name = rest[0];
  const dateStr = rest[1]; // valfritt

  const res = await upsertAstroHourly({ name, lat, lon, dateStr });
  console.log(`[astro] upsert ${res.inserted} rows for ${name} (${lat},${lon})`);
  console.log(`        window: ${res.from} .. ${res.to}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
