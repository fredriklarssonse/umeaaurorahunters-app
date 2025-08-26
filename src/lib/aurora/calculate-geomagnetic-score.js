import { CONFIG } from '../../config/app-config.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const avg = (arr) => { const v = arr.filter(Number.isFinite); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };
const minV = (arr) => { const v = arr.filter(Number.isFinite); return v.length ? Math.min(...v) : null; };

function bandScore(value, bands, scores) {
  if (value == null) return 0;
  for (let i = bands.length - 1; i >= 0; i--) {
    if (value >= bands[i]) return scores[i + 1];
  }
  return scores[0];
}

export function calculateGeomagneticScoreDetailed(history, opts = {}) {
  const windowSize = Number.isFinite(opts.windowSize) ? opts.windowSize : CONFIG.geomagnetic.windowSize;
  const clean = (history || []).filter(d => !d?.suspect_data);
  const series = clean.length ? clean : (history || []);
  if (!series.length) {
    return { score: 0, breakdown: [{ label: 'Ingen solvinddata', contribution: 0 }], inputs: {}, window: { count: 0 } };
  }

  const last = series.slice(-windowSize);
  const speedAvg   = avg(last.map(d => d.speed));
  const densityAvg = avg(last.map(d => d.density));
  const bzMin      = minV(last.map(d => d.bz));
  const btAvg      = avg(last.map(d => d.bt));

  const g = CONFIG.geomagnetic;

  // Speed: 0/1/2/3/4 enligt band
  const speedPart = bandScore(speedAvg, g.speedBands, g.speedScores);
  const speedLabel =
    speedAvg == null ? 'Solvindshastighet saknas'
      : speedAvg >= 700 ? `Hög solvindshastighet (${Math.round(speedAvg)} km/s) = +4`
      : speedAvg >= 600 ? `Hög solvindshastighet (${Math.round(speedAvg)} km/s) = +3`
      : speedAvg >= 500 ? `Förhöjd solvindshastighet (${Math.round(speedAvg)} km/s) = +2`
      : speedAvg >= 400 ? `Måttlig solvindshastighet (${Math.round(speedAvg)} km/s) = +1`
      : `Låg solvindshastighet (${Math.round(speedAvg||0)} km/s) = +0`;

  // Bz: negativ bra, nordlig straff
  let bzPart = 0;
  let bzLabel = 'Bz saknas';
  if (bzMin != null) {
    if (bzMin <= g.bzBands[3]) bzPart = g.bzScores[3]; // <= -10 → +4
    else if (bzMin <= g.bzBands[2]) bzPart = g.bzScores[2];
    else if (bzMin <= g.bzBands[1]) bzPart = g.bzScores[1];
    else if (bzMin <= g.bzBands[0]) bzPart = g.bzScores[0];
    else if (bzMin >= CONFIG.geomagnetic.bzNorthPenaltyThreshold) bzPart = CONFIG.geomagnetic.bzNorthPenalty;
    else bzPart = 0;

    bzLabel =
      bzMin <= -10 ? `Starkt sydlig Bz (${bzMin.toFixed(1)} nT) = +4`
      : bzMin <= -6 ? `Sydlig Bz (${bzMin.toFixed(1)} nT) = +3`
      : bzMin <= -3 ? `Måttligt sydlig Bz (${bzMin.toFixed(1)} nT) = +2`
      : bzMin <= -1 ? `Svagt sydlig Bz (${bzMin.toFixed(1)} nT) = +1`
      : bzMin >= +5 ? `Nordlig Bz (${bzMin.toFixed(1)} nT) = −2`
      : `Neutral/nordlig Bz (${bzMin.toFixed(1)} nT) = +0`;
  }

  // Bt
  let btPart = 0;
  let btLabel = 'Bt saknas';
  if (btAvg != null) {
    if (btAvg >= 20) btPart = 3;
    else if (btAvg >= 15) btPart = 2;
    else if (btAvg >= 10) btPart = 1;
    else btPart = 0;
    btLabel = btAvg >= 20 ? `Starkt IMF Bt (${btAvg.toFixed(1)} nT) = +3`
      : btAvg >= 15 ? `Förhöjt IMF Bt (${btAvg.toFixed(1)} nT) = +2`
      : btAvg >= 10 ? `Måttligt IMF Bt (${btAvg.toFixed(1)} nT) = +1`
      : `Svagt IMF Bt (${btAvg?.toFixed?.(1) ?? btAvg}) = +0`;
  }

  // Density
  let denPart = 0;
  let denLabel = 'Densitet saknas';
  if (densityAvg != null) {
    if (densityAvg < 1) denPart = -2;
    else if (densityAvg < 2) denPart = -1;
    else if (densityAvg <= 5) denPart = 0;
    else if (densityAvg <= 15) denPart = 1;
    else if (densityAvg <= 30) denPart = 0.5;
    else denPart = 0;
    denLabel =
      densityAvg < 1   ? `Mycket låg densitet (${densityAvg.toFixed(1)}) = −2`
      : densityAvg < 2 ? `Låg densitet (${densityAvg.toFixed(1)}) = −1`
      : densityAvg <= 5 ? `Måttlig densitet (${densityAvg.toFixed(1)}) = +0`
      : densityAvg <= 15 ? `Förhöjd densitet (${densityAvg.toFixed(1)}) = +1`
      : densityAvg <= 30 ? `Hög densitet (${densityAvg.toFixed(1)}) = +0.5`
      : `Extrem densitet (${densityAvg.toFixed(1)}) = +0 (neutraliserad)`;
  }

  const parts = [
    { contribution: speedPart, label: speedLabel },
    { contribution: bzPart,    label: bzLabel },
    { contribution: btPart,    label: btLabel },
    { contribution: denPart,   label: denLabel }
  ];
  const raw = parts.reduce((s,p)=>s+(p.contribution||0), 0);
  const score = clamp(raw, CONFIG.geomagnetic.clampMin, CONFIG.geomagnetic.clampMax);

  return {
    score,
    breakdown: parts,
    inputs: { windowSize, speedAvg, densityAvg, bzMin, btAvg },
    window: { count: last.length, from: last[0]?.time_tag ?? null, to: last[last.length-1]?.time_tag ?? null }
  };
}

export function calculateGeomagneticScore(history, opts) {
  return calculateGeomagneticScoreDetailed(history, opts).score;
}
