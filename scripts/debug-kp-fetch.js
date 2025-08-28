// scripts/debug-kp-fetch.js
import { CONFIG } from '../src/config/app-config.js';

const UA = 'UmeaaAuroraHunters/1.0';
const url = CONFIG.kp?.urls?.hourly_json || process.env.KP_HOURLY_JSON;
if (!url) { console.log('[debug-kp] No KP url set'); process.exit(0); }

const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
console.log('[debug-kp] status', r.status);
const j = await r.json();
console.log('[debug-kp] top-level keys:', Object.keys(j||{}).slice(0,10));
console.log('[debug-kp] sample:', Array.isArray(j) ? j.slice(0,3) : (j?.data ? j.data.slice(0,3) : j));
