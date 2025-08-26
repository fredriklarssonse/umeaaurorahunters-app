import { CONFIG } from '../../config/app-config.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function kpApproxFromGeoScore(geoScore) {
  // enkel proxy: 0..10 → 0..9
  return clamp(geoScore * 0.9, 0, 9);
}

function boundaryLatFromKp(kp) {
  const table = CONFIG.auroralOval.kpBoundaryLat;
  const k0 = Math.floor(kp), k1 = Math.ceil(kp);
  if (k0 === k1) return table[k0] ?? 60;
  const v0 = table[k0] ?? 60;
  const v1 = table[k1] ?? v0;
  const t = kp - k0;
  return v0 + (v1 - v0) * t; // linjär interpolation
}

/**
 * Beräkna hur starkt norrskenet “biter” på vald latitud.
 * @returns { factor:0..1, adjusted:number (0..10), boundaryLat:number, kpApprox:number, label:string }
 */
export function adjustGeomagneticForLatitude(geomagneticScore, latDeg) {
  const kp = kpApproxFromGeoScore(geomagneticScore);
  const boundaryLat = boundaryLatFromKp(kp);          // ungefärlig lat för ovalens sydgräns
  const fall = CONFIG.auroralOval.falloffDeg;

  // Om du är norr om (eller på) gränsen → full effekt (1.0).
  // Söder om gränsen: linjärt avtagande till 0 vid 'falloffDeg' längre söderut.
  const delta = boundaryLat - latDeg; // positivt => du ligger SÖDER om gränsen
  const factor = clamp(1 - clamp(delta, 0, fall) / fall, 0, 1);

  const adjusted = clamp(geomagneticScore * factor, 0, 10);

  const label =
    delta <= 0
      ? `På/norr om ovalens gräns (${boundaryLat.toFixed(1)}°) → full effekt`
      : `~${delta.toFixed(1)}° söder om gränsen (${boundaryLat.toFixed(1)}°) → faktor ${factor.toFixed(2)}`;

  return { factor, adjusted, boundaryLat, kpApprox: kp, label };
}
