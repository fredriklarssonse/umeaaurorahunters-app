// scripts/check-astro-now.js
import { calculateSightabilityDetailed } from '../src/lib/astro/sightability.js';

const lat = process.argv[2] ? +process.argv[2] : 63.8258;
const lon = process.argv[3] ? +process.argv[3] : 20.2630;
const when = new Date();

const res = await calculateSightabilityDetailed({ lat, lon, when, cloudsPct: null, geomLocal10: 3, light: null });
console.log('Now:', when.toISOString());
console.log('lat,lon:', lat, lon);
console.log('sunAltDeg:', res.inputs.sunAltitude.toFixed(2));
console.log('moonAltDeg:', res.inputs.moonAltitude.toFixed(2));
console.log('moonIllum%:', (res.inputs.moonIllumination*100).toFixed(0));
console.log('score:', res.score.toFixed(2));
console.log('first breakdown:', res.breakdown?.[0]?.label);
