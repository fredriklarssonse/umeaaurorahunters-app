import { suggestCommunitySpots } from '../src/lib/spots/find-spots-nearby.js';

const input = process.argv.slice(2);
const loc = input.length === 2 ? { lat: parseFloat(input[0]), lon: parseFloat(input[1]), name: 'Custom' }
          : input.length === 1 ? input[0]
          : 'umea';

const fmt = (x)=> x==null ? '—' : `${Math.round(x)}%`;

(async ()=>{
  const list = await suggestCommunitySpots(loc);
  if (!list.length) {
    console.log('Inga offentliga platser inom sökradie.');
    return;
  }
  console.log(`\nPopulära norrskensplatser runt dig:`);
  for (const s of list) {
    console.log(` • ${s.name}  (${s.distance_km} km)  score=${s.score}`);
    console.log(`   Sight=${s.sightability}/10  Moln≈${fmt(s.clouds_pct)}  Ljus=${s.light_category||'—'}${s.light_bortle?` (B${s.light_bortle})`:''}`);
    console.log(`   Koord: ${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}  [${s.meta.light_source||'zones'}]`);
  }
  console.log();
})().catch(e=>{ console.error(e); process.exitCode=1; });
