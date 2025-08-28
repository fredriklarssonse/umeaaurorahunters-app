// src/lib/aurora/fetch-ae-dst.js
// AE (quicklook) och Dst (quicklook/bestämmelser kan ändras). Vi gör "best effort".

const UA = 'UmeaaAuroraHunters/1.0';

// AE quicklook från Kyoto WDC "data_dir" (en fil per dag, text).
const KYOTO_AE_BASE = 'https://wdc.kugi.kyoto-u.ac.jp/ae_realtime/data_dir';

// Dst: HTML-sida (heuristisk parsning). Håll den valfri i config.
const KYOTO_DST_PRESENTMONTH = 'https://wdc.kugi.kyoto-u.ac.jp/dst_realtime/presentmonth/';

function pad2(n) { return String(n).padStart(2, '0'); }
function ymdUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return { yyyy: y, yy: String(y).slice(-2), mm: pad2(m), dd: pad2(day) };
}

export async function fetchAeQuicklookLatest() {
  const { yyyy, yy, mm, dd } = ymdUTC();
  const url = `${KYOTO_AE_BASE}/${yyyy}/${mm}/${dd}/ae${yy}${mm}${dd}`;

  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const txt = await r.text();

  // Leta upp sista raden som verkar innehålla ~60 värden (en timmes minutvärden)
  const lines = txt.trim().split(/\r?\n/).filter(Boolean);
  let lastNums = null;
  for (const L of lines) {
    const nums = L.match(/-?\d+(\.\d+)?/g);
    if (nums && nums.length >= 60) lastNums = nums.map(Number);
  }
  if (!lastNums) return null;

  const lastVal = lastNums[lastNums.length - 1];
  if (!Number.isFinite(lastVal)) return null;

  // Stämpla “nuvarande minut” (avrundad till minut, UTC)
  const now = new Date();
  const minute = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes(), 0, 0
  )).toISOString();

  return { minute, ae_nt: lastVal };
}

export async function fetchDstQuicklookLatest() {
  // OBS: Heuristisk parsning av HTML; håll 'use_dst' = false som default.
  const r = await fetch(KYOTO_DST_PRESENTMONTH, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const html = await r.text();

  // Grov heuristik: hämta sista matchande sifferrad (dag tim dst)
  // Mönstret i tabellen kan variera; vi försöker hitta den sista tripeln där sista talet är Dst.
  const rows = [...html.matchAll(/>\s*(\d{1,2})\s+(\d{1,2})\s+(-?\d{1,4})\s*</g)];
  if (!rows.length) return null;
  const m = rows[rows.length - 1];
  const dst = Number(m[3]);
  if (!Number.isFinite(dst)) return null;

  // Stämpla timme (UTC)
  const now = new Date();
  const hour = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    now.getUTCHours(), 0, 0, 0
  )).toISOString();

  return { hour, dst_nt: dst };
}
