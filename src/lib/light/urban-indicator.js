import { CONFIG } from '../../config/app-config.js';

// Haversine (km) + destinationspunkt
const R = 6371; // km
function toRad(d){ return d*Math.PI/180; }
function toDeg(r){ return r*180/Math.PI; }

export function haversineKm(lat1, lon1, lat2, lon2){
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
export function destPoint(lat, lon, bearingDeg, distKm){
  const br = toRad(bearingDeg);
  const dR = distKm / R;
  const φ1 = toRad(lat), λ1 = toRad(lon);
  const φ2 = Math.asin(Math.sin(φ1)*Math.cos(dR) + Math.cos(φ1)*Math.sin(dR)*Math.cos(br));
  const λ2 = λ1 + Math.atan2(Math.sin(br)*Math.sin(dR)*Math.cos(φ1), Math.cos(dR)-Math.sin(φ1)*Math.sin(φ2));
  return { lat: toDeg(φ2), lon: ((toDeg(λ2)+540)%360)-180 };
}

/**
 * Klassificera plats relativt stadskärna (MVP).
 * Returnerar { class:'urban'|'suburban'|'rural', scoreLight:0..1, distanceKm, cityName }
 */
export function classifyLightByCityZone(locKey, lat, lon){
  const def = CONFIG.lightZones[locKey];
  if(!def) return { class:'unknown', scoreLight:0.5, distanceKm:null, cityName:null };

  const d = haversineKm(lat, lon, def.center.lat, def.center.lon);
  let cls='rural', score=1.0; // mörkast bäst
  if (d <= def.urban_km){ cls='urban'; score=0.1; }
  else if (d <= def.suburban_km){ cls='suburban'; score=0.6; }
  else { cls='rural'; score=1.0; }

  return { class: cls, scoreLight: score, distanceKm: d, cityName: def.name };
}