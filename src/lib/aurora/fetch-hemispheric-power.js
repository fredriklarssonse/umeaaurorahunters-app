// src/lib/aurora/fetch-hemispheric-power.js
import fs from 'fs/promises';
import path from 'path';

const UA = 'UmeaaAuroraHunters/1.0';
const URL = 'https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt';
const CACHE_DIR = 'cache/aurora';
const CACHE_FILE = 'hemi_power_latest.txt';
const TTL_MIN = 5;

async function readFresh(file, ttlMin) {
  try {
    const st = await fs.stat(file);
    const age = (Date.now() - st.mtimeMs) / 60000;
    if (age < ttlMin) return await fs.readFile(file, 'utf8');
  } catch {}
  return null;
}

function parseHemiPower(txt) {
  // Hitta sista giltiga datarad: "YYYY-MM-DDTHH:MMZ, northGW, southGW"
  const lines = txt.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
  let latest = null;
  for (const l of lines) {
    const m = l.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z)[,\s]+(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)/);
    if (m) latest = { time_tag: m[1], north_gw: +m[2], south_gw: +m[4] };
  }
  return latest;
}

export async function fetchHemisphericPowerLatest() {
  await fs.mkdir(path.join(CACHE_DIR), { recursive: true });
  const f = path.join(CACHE_DIR, CACHE_FILE);

  let txt = await readFresh(f, TTL_MIN);
  if (!txt) {
    const r = await fetch(URL, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HEMI ${r.status}`);
    txt = await r.text();
    await fs.writeFile(f, txt);
  }

  return parseHemiPower(txt);
}
