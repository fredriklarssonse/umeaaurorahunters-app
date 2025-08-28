// scripts/debug-hpo-fetch.js
import { fetchHp60Json, fetchHp30Json, normalizeHp60, normalizeHp30 } from '../src/lib/aurora/fetch-hpo-forecast.js';

const show = (name, arr, n=5) => {
  console.log(`== ${name} (${arr.length}) ==`);
  for (const r of arr.slice(0,n)) console.log(r);
};

const j60 = await fetchHp60Json();
const j30 = await fetchHp30Json();

console.log('[debug] hp60 keys:', j60 ? Object.keys(j60).slice(0,10) : 'null');
console.log('[debug] hp30 keys:', j30 ? Object.keys(j30).slice(0,10) : 'null');

const r60 = j60 ? normalizeHp60(j60) : [];
const r30 = j30 ? normalizeHp30(j30) : [];
show('hp60 normalized', r60);
show('hp30 normalized', r30);
