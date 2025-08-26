import { CONFIG } from '../../config/app-config.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const toNum = (x, fb = null) => (Number.isFinite(+x) ? +x : fb);
const rad2deg = (r) => (r == null ? null : (r * 180) / Math.PI);

function first(obj, keys, fb = null) { if (!obj) return fb; for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k]; return fb; }
function degify(x) { const n = toNum(x, null); if (n == null) return null; return Math.abs(n) <= Math.PI + 1e-6 ? rad2deg(n) : n; }
function extractIllumination(moon) {
  const raw = first(moon, ['illumination','moonIllumination','moon_illumination'], null);
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && 'fraction' in raw) return toNum(raw.fraction, null);
  return toNum(raw, null);
}

function baseSunPoints(sunAltDeg) {
  if (sunAltDeg == null) return { pts: 0, label: 'Solhöjd okänd = +0' };
  const alt = toNum(sunAltDeg, 90);
  if (alt > -6)   return { pts: 0, label: `Sol ${alt.toFixed(1)}° (för ljust) = +0` };
  if (alt > -12)  return { pts: 1, label: `Sol ${alt.toFixed(1)}° (skymning) = +1` };
  if (alt > -18)  return { pts: 3, label: `Sol ${alt.toFixed(1)}° (mörkt) = +3` };
                   return { pts: 4, label: `Sol ${alt.toFixed(1)}° (astron. mörker) = +4` };
}
function baseCloudPoints(weather) {
  const cloudsPct = clamp(toNum(first(weather, ['clouds','cloudiness','cloudCover','cloud_cover'], 100), 100), 0, 100);
  let pts, label;
  if (cloudsPct <= 10)      { pts = +4; label = `Klar himmel (${cloudsPct}% moln) = +4`; }
  else if (cloudsPct <= 30) { pts = +3; label = `Lätt molnighet (${cloudsPct}% moln) = +3`; }
  else if (cloudsPct <= 60) { pts = +1; label = `Växlande molnighet (${cloudsPct}% moln) = +1`; }
  else if (cloudsPct <= 80) { pts = -1; label = `Mycket moln (${cloudsPct}% moln) = −1`; }
  else                      { pts = -3; label = `Tjockt molntäcke (${cloudsPct}% moln) = −3`; }

  const thickness = toNum(first(weather, ['cloud_opacity','cloud_thickness'], null), null);
  if (Number.isFinite(thickness)) {
    const extra = -Math.min(1, Math.max(0, thickness)); // 0..-1
    pts += extra;
    label += ` (tjocklek=${thickness.toFixed(2)} → ${extra.toFixed(1)})`;
  }
  return { pts, label };
}
function baseMoonPoints(moon) {
  const illumination = clamp(extractIllumination(moon) ?? 0, 0, 1);
  const alt = degify(first(moon, ['moonAltitude','moon_altitude','moonAlt','moon_alt'], -90));
  if (alt <= 0) return { pts: +2, label: `Månen under horisonten (${Math.round(illumination*100)}%) = +2` };
  const altFactor = clamp(0.2 + 0.8 * Math.min(1, alt / 60), 0.2, 1.0);
  const brightness = illumination * altFactor;
  if (brightness >= 0.9)      return { pts: -3, label: `Ljusstark måne (${Math.round(illumination*100)}% @ ${alt.toFixed(0)}°) = −3` };
  if (brightness >= 0.6)      return { pts: -2, label: `Kraftigt månljus (${Math.round(illumination*100)}% @ ${alt.toFixed(0)}°) = −2` };
  if (brightness >= 0.3)      return { pts: -1, label: `Måttligt månljus (${Math.round(illumination*100)}% @ ${alt.toFixed(0)}°) = −1` };
  return { pts: 0, label: `Svagt månljus (${Math.round(illumination*100)}% @ ${alt.toFixed(0)}°) = +0` };
}

export function calculateSightabilityDetailed(geomagneticScore, moon, weather, opts = {}) {
  const cfg = {
    maxScore: CONFIG.sightability.maxScore,
    sunGateDeg: CONFIG.sightability.sunGateDeg,
    weights: { ...CONFIG.sightability.weights, ...(opts.weights || {}) }
  };
  const sunAlt = degify(first(moon, ['sunAltitude','sun_altitude','sunAlt','sun_alt'], null));

  if (sunAlt != null && sunAlt > cfg.sunGateDeg) {
    return {
      score: 0,
      breakdown: [{ contribution: 0, label: `SOL-GATE: Sol ${sunAlt.toFixed(1)}° > ${cfg.sunGateDeg}° ⇒ omöjligt se norrsken (score=0)` }],
      inputs: {
        sunAltitude: sunAlt,
        cloudsPct: first(weather, ['clouds','cloudiness','cloudCover','cloud_cover'], null),
        moonIllumination: extractIllumination(moon),
        moonAltitude: degify(first(moon, ['moonAltitude','moon_altitude','moonAlt','moon_alt'], null)),
        geomagneticScore
      }
    };
  }

  const sunBase   = baseSunPoints(sunAlt);
  const cloudBase = baseCloudPoints(weather);
  const moonBase  = baseMoonPoints(moon);

  const g = Math.max(0, Math.min(10, toNum(geomagneticScore, 0)));
  const t = g <= 3 ? 0 : g >= 8 ? 1 : (g - 3) / 5;
  const moonWeight = cfg.weights.moonLowGeo + (cfg.weights.moonHighGeo - cfg.weights.moonLowGeo) * t;

  const parts = [
    { contribution: sunBase.pts   * cfg.weights.sun,    label: `${sunBase.label} × w=${cfg.weights.sun}` },
    { contribution: cloudBase.pts * cfg.weights.clouds, label: `${cloudBase.label} × w=${cfg.weights.clouds}` },
    { contribution: moonBase.pts  * moonWeight,         label: `${moonBase.label} × w=${moonWeight.toFixed(2)}` }
  ];

  const raw = parts.reduce((a, p) => a + (p.contribution || 0), 0);
  const score = Math.max(0, Math.min(cfg.maxScore, raw));

  return {
    score,
    breakdown: parts.map(p => ({ label: p.label, contribution: Math.round((p.contribution + Number.EPSILON) * 10) / 10 })),
    inputs: {
      sunAltitude: sunAlt,
      cloudsPct: first(weather, ['clouds','cloudiness','cloudCover','cloud_cover'], null),
      cloudThickness: first(weather, ['cloud_opacity','cloud_thickness'], null),
      moonIllumination: extractIllumination(moon),
      moonAltitude: degify(first(moon, ['moonAltitude','moon_altitude','moonAlt','moon_alt'], null)),
      geomagneticScore: g,
      weights: { sun: cfg.weights.sun, clouds: cfg.weights.clouds, moon: +moonWeight.toFixed(2) }
    }
  };
}

export function calculateSightability(geomagneticScore, moon, weather, opts) {
  return calculateSightabilityDetailed(geomagneticScore, moon, weather, opts).score;
}
