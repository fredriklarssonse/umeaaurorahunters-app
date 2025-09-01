// src/lib/compute/calculateVisibility.js
'use strict';

/**
 * calculateVisibility(inputs)
 * inputs: { sunElevationDeg, clouds:{low,mid,high}, moon:{illum, altDeg}, lightZones:{class} }
 * Returnerar { value: 0–10, breakdown: [...] }
 */
export function calculateVisibility({ sunElevationDeg, clouds, moon, lightZones }) {
  const darkness = twilightScore(sunElevationDeg);   // 0–10
  const cloudPenalty = cloudPenaltyScore(clouds);    // 0–10
  const moonPenalty = moonPenaltyScore(moon);        // 0–10
  const lpPenalty = lightPollutionPenalty(lightZones); // 0–10

  const vis = darkness - (cloudPenalty * 0.6 + moonPenalty * 0.25 + lpPenalty * 0.15);
  const value = clamp(vis, 0, 10);

  const breakdown = [
    { code: 'breakdown.twilight', params: { elevationDeg: sunElevationDeg } },
    { code: 'breakdown.clouds', params: { low: clouds.low, mid: clouds.mid, high: clouds.high } },
    { code: 'breakdown.moon', params: { illum: moon.illum, altDeg: moon.altDeg } },
    { code: 'breakdown.light_zones', params: { class: lightZones.class || 'unknown' } },
  ];

  return { value, breakdown };
}

function twilightScore(elev) {
  if (elev >= -6) return 1;
  if (elev <= -18) return 10;
  return 1 + (Math.abs(elev + 6) / 12) * 9;
}

function cloudPenaltyScore({ low = 0, mid = 0, high = 0 }) {
  const w = (low/1) * 0.6 + (mid/1) * 0.3 + (high/1) * 0.1;
  return clamp(w / 100 * 10, 0, 10); // clouds är i %
}

function moonPenaltyScore({ illum = 0, altDeg = -90 }) {
  const altF = clamp((altDeg + 5) / 45, 0, 1);
  return clamp(illum * altF * 10, 0, 10);
}

function lightPollutionPenalty({ class: klass = 'bortle5' }) {
  const map = {
    bortle1: 0.2, bortle2: 0.6, bortle3: 1.0, bortle4: 1.8,
    bortle5: 2.6, bortle6: 3.5, bortle7: 5.0, bortle8: 6.5, bortle9: 8.0,
  };
  return clamp((map[klass] ?? 2.6), 0, 10);
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
