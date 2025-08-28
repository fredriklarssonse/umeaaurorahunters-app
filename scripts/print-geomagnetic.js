// scripts/print-geomagnetic.js
import { getGlobalGeomagneticNow } from '../src/lib/aurora/global-geomagnetic.js';

const pad = (s,n)=>String(s).padStart(n,' ');
const fmt = (x)=> x==null ? '—' : (typeof x==='number' ? x.toFixed(2) : String(x));

(async () => {
  const g = await getGlobalGeomagneticNow();
  if (!g) { console.log('No global geomagnetic data'); process.exit(0); }

  console.log('Global geomagnetic (blended base+aux)');
  console.log('  time_tag  :', g.time_tag);
  console.log('  score(0-10):', fmt(g.global_score));
  console.log('  kp_proxy  :', fmt(g.kp_proxy));
  console.log('  stale     :', fmt(g.stale_hours), 'h', `(${g.stale_status})`);
  console.log('');

  if (g.detail?.baseParts?.length) {
    console.log('Base parts:');
    for (const p of g.detail.baseParts) {
      console.log(
        `  ${pad(p.kind,10)}  kp≈${fmt(p.kp_equiv)}  score=${fmt(p.score10)}  w=${fmt(p.w)}  t=${p.time}`
      );
    }
  }
  if (g.hemi_power_gw!=null || g.ae_quicklook!=null || g.dst_quicklook!=null) {
    console.log('\nAux (raw):');
    if (g.hemi_power_gw!=null) console.log('  HemiPower GW:', fmt(g.hemi_power_gw), 'at', g.hemi_power_time || '—');
    if (g.ae_quicklook!=null)  console.log('  AE (nT)    :', fmt(g.ae_quicklook),    'at', g.ae_time || '—');
    if (g.dst_quicklook!=null) console.log('  Dst (nT)   :', fmt(g.dst_quicklook),   'at', g.dst_time || '—');
  }
})();
