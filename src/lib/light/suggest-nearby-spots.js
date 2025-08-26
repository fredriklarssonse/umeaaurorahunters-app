import { CONFIG } from '../../config/app-config.js';
import { classifyLightByCityZone, destPoint } from './urban-indicator.js';
import { getWeatherHourly as getHourlyMulti } from '../astro/weather.js';

// Lättviktad “snabb” väderfunktion (Open-Meteo only) för att inte bränna fler källor per provpunkt
async function getWeatherHourlyQuick(lat, lon){
  if (CONFIG.spotSuggest.weatherMode !== 'openmeteo_only'){
    return getHourlyMulti(lat, lon); // använder multi-källa om man vill
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover&forecast_days=2&timezone=UTC`;
  const res = await fetch(url, { headers: { 'cache-control':'no-cache' } });
  if (!res.ok) return [];
  const j = await res.json();
  const times = j?.hourly?.time || [];
  const cover = j?.hourly?.cloudcover || [];
  return times.map((t,i)=>({ dt:new Date(t).toISOString(), clouds: typeof cover[i]==='number'? cover[i]:null }));
}

// Samma nattfönster-heuristik som outlook (nautisk skymning → nautisk gryning), delat vid midnatt
import SunCalc from 'suncalc';
function tonightWindowsSeasonal(lat, lon, now=new Date()){
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 12, 0, 0);
  const tA = SunCalc.getTimes(today, lat, lon);
  const tB = SunCalc.getTimes(tomorrow, lat, lon);
  const start = tA.nauticalDusk ?? tA.dusk ?? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20,0,0);
  const end   = tB.nauticalDawn ?? tB.dawn ?? new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 2,0,0);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 0);
  const early = { label:'early', startISO:start.toISOString(), endISO:new Date(Math.min(midnight,end)).toISOString() };
  const late  = { label:'late',  startISO:new Date(Math.max(midnight,start)).toISOString(), endISO:end.toISOString() };
  const out = [];
  if (new Date(early.endISO) > new Date(early.startISO)) out.push(early);
  if (new Date(late.endISO) > new Date(late.startISO)) out.push(late);
  return out;
}

// Hjälpare
const avg = (a)=>{ const v=a.filter(x=>Number.isFinite(x)); return v.length? v.reduce((s,x)=>s+x,0)/v.length : null; };
const inNorthSector = (bearing)=> (bearing>=330 || bearing<=30);

/**
 * Hitta N bästa mörkare platser i närheten.
 * Returnerar [{ lat, lon, distanceKm, bearingDeg, zoneClass, cloudsEarly, cloudsLate, score, reason }, ...]
 */
export async function suggestNearbySpots(locKey, lat, lon, topN=3){
  const { ringDistancesKm, bearingsDeg, weights, preferNorthBonus } = CONFIG.spotSuggest;
  const windows = tonightWindowsSeasonal(lat, lon, new Date());

  const candidates = [];
  for (const dist of ringDistancesKm){
    for (const b of bearingsDeg){
      const p = destPoint(lat, lon, b, dist);
      const zone = classifyLightByCityZone(locKey, p.lat, p.lon);
      // hoppa över ren stadskärna – vi vill ju “runtikring”
      if (zone.class === 'urban') continue;

      // hämta timvisa moln (snabbkälla) och medla per fönster
      const hourly = await getWeatherHourlyQuick(p.lat, p.lon);
      const cloudsForWindow = (w) => {
        const t0 = new Date(w.startISO).getTime(), t1 = new Date(w.endISO).getTime();
        const vals = hourly.filter(h => {
          const t = new Date(h.dt).getTime();
          return t>=t0 && t<t1;
        }).map(h => (typeof h.clouds==='number'? h.clouds : null));
        return avg(vals);
      };

      const e = windows.find(w=>w.label==='early');
      const l = windows.find(w=>w.label==='late');
      const cloudsEarly = e ? cloudsForWindow(e) : null;
      const cloudsLate  = l ? cloudsForWindow(l) : null;

      // normalisera till 0..1 (mindre moln = bättre)
      const cloudsScoreEarly = (cloudsEarly==null)? 0.5 : (1 - Math.min(100, Math.max(0, cloudsEarly))/100);
      const cloudsScoreLate  = (cloudsLate==null)?  0.5 : (1 - Math.min(100, Math.max(0, cloudsLate))/100);
      const cloudsScore = avg([cloudsScoreEarly, cloudsScoreLate] .filter(Number.isFinite)) ?? 0.5;

      // total score
      let score = weights.clouds*cloudsScore + weights.light*zone.scoreLight;
      if (inNorthSector(b)) score += preferNorthBonus; // bonus om punkten ligger norrut

      candidates.push({
        lat: p.lat, lon: p.lon,
        distanceKm: dist,
        bearingDeg: b,
        zoneClass: zone.class,
        zoneLightScore: zone.scoreLight,
        cloudsEarlyPct: cloudsEarly,
        cloudsLatePct: cloudsLate,
        score: Math.round(score*10)/10,
        reason: buildReason(zone.class, cloudsEarly, cloudsLate, inNorthSector(b))
      });
    }
  }

  // sortera efter score, ta topN
  candidates.sort((a,b)=> b.score - a.score);
  return candidates.slice(0, topN);
}

function buildReason(zoneClass, cE, cL, north){
  const parts = [];
  parts.push(zoneClass==='rural' ? 'mörk omgivning' : 'mindre stadsljus');
  if (Number.isFinite(cE)) parts.push(`moln tidigt ~${Math.round(cE)}%`);
  if (Number.isFinite(cL)) parts.push(`moln sent ~${Math.round(cL)}%`);
  if (north) parts.push('norr om din position');
  return parts.join(', ');
}
