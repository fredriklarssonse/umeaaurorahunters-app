// src/lib/compute/calculatePotential.js
'use strict';

/**
 * calculatePotential(hpo, kp, lat)
 * Returnerar { value: 0–10, breakdown: [...] }
 */
export function calculatePotential({ hpo = null, kp, lat }) {
  const base = hpo == null ? kp : (kp * 0.7 + normHpo(hpo) * 0.3);
  const latAdj = latitudeAdjustment(lat);
  const raw = base * latAdj;

  const clamped = clamp(raw, 0, 10);

  const breakdown = [
    { code: 'breakdown.kp', params: { kp } },
    ...(hpo == null ? [] : [{ code: 'breakdown.hpo_blend', params: { hpo } }]),
    { code: 'breakdown.lat_oval', params: { lat: lat, adj: round2(latAdj) } },
  ];

  return { value: clamped, breakdown };
}

function latitudeAdjustment(lat) {
  const d = Math.abs(lat - 66);
  let adj = 1.2 - d * 0.02;
  if (lat > 70) adj -= (lat - 70) * 0.01;
  return clamp(adj, 0.7, 1.3);
}

function normHpo(hpo) {
  const v = (Number(hpo) / 15);
  return clamp(v, 0, 10);
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function round2(n) { return Math.round(n * 100) / 100; }
