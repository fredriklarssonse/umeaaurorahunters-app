// src/lib/aurora/aux-indices.js
import { CONFIG } from '../../config/app-config.js';
import { fetchHemisphericPowerLatest } from './fetch-hemispheric-power.js';
import { fetchAeQuicklookLatest, fetchDstQuicklookLatest } from './fetch-ae-dst.js';
import { saveData } from '../db/savedata.js';

function piecewiseToScore(x, points) {
  if (x == null) return null;
  for (let i = 0; i < points.length - 1; i++) {
    const [xa, sa] = points[i], [xb, sb] = points[i + 1];
    if (x <= xb) {
      const t = (x - xa) / Math.max(1e-9, xb - xa);
      return sa + t * (sb - sa);
    }
  }
  return points[points.length - 1][1];
}

export async function getAuxIndicesNow() {
  const out = { score_hemi: null, score_ae: null, score_dst: null, raw: {} };

  // Hemispheric Power (NOAA SWPC)
  if (CONFIG.geomagnetic?.sources?.use_hemi_power) {
    try {
      const hp = await fetchHemisphericPowerLatest();
      if (hp?.time_tag) {
        await saveData('aurora_hemi_power_30m', [{
          time_tag: hp.time_tag, north_gw: hp.north_gw ?? null, south_gw: hp.south_gw ?? null
        }], ['time_tag']);

        const gw = hp.north_gw ?? null; // N-halvklot för oss
        const s = piecewiseToScore(gw, CONFIG.geomagnetic.maps.hemiPowerGW);
        out.score_hemi = s;
        out.raw.hemi_power_gw = gw;
        out.raw.hemi_power_time = hp.time_tag;
      }
    } catch (_) {}
  }

  // AE quicklook (Kyoto WDC)
  if (CONFIG.geomagnetic?.sources?.use_ae) {
    try {
      const ae = await fetchAeQuicklookLatest();
      if (ae?.minute) {
        await saveData('aurora_ae_quicklook_min', [{
          minute: ae.minute, ae_nt: ae.ae_nt
        }], ['minute']);

        out.score_ae = piecewiseToScore(ae.ae_nt, CONFIG.geomagnetic.maps.aeNT);
        out.raw.ae_quicklook = ae.ae_nt;
        out.raw.ae_time = ae.minute;
      }
    } catch (_) {}
  }

  // Dst quicklook (valfritt)
  if (CONFIG.geomagnetic?.sources?.use_dst) {
    try {
      const d = await fetchDstQuicklookLatest();
      if (d?.hour != null && Number.isFinite(d.dst_nt)) {
        const mag = Math.max(0, -d.dst_nt);
        out.score_dst = piecewiseToScore(mag, CONFIG.geomagnetic.maps.dstNT);
        out.raw.dst_quicklook = d.dst_nt;
        out.raw.dst_time = d.hour;
      }
    } catch (_) {}
  }

  return out;
}

export function blendWithAux(baseScore, weights, aux) {
  const parts = [];
  const push = (v, w) => { if (v != null && w > 0) parts.push({ v, w }); };

  push(baseScore?.hpo, weights.w_hpo ?? 0.55);
  push(baseScore?.kp,  weights.w_kp  ?? 0.15);
  push(baseScore?.sw,  weights.w_sw  ?? 0.10);
  push(aux?.score_hemi, weights.w_hemi ?? 0.12);
  push(aux?.score_ae,   weights.w_ae   ?? 0.06);
  push(aux?.score_dst,  weights.w_dst  ?? 0.02);

  const W = parts.reduce((a, p) => a + p.w, 0) || 1;
  return parts.reduce((a, p) => a + p.v * p.w, 0) / W;
}
