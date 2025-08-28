// src/lib/lightpollution/get-lightpollution.js
import { CONFIG } from '../../config/app-config.js';

const R_EARTH = 6371;
const toRad = (d) => (d * Math.PI / 180);

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const la1 = toRad(lat1), la2 = toRad(lat2);
  const a = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

/**
 * Zones-provider:
 * - Väljer närmaste stadskärna från CONFIG.lightZones
 * - Klassar kategori efter avstånd: urban_core / suburban / rural
 * - Mappning till ungefärlig Bortle: 8 / 6 / 3 (enkelt men praktiskt)
 */
export async function getLightPollution({ lat, lon }) {
  const provider = CONFIG?.lightPollution?.provider || process.env.LIGHT_PROVIDER || 'zones';

  // Just nu stöder vi “zones” stabilt. Andra providers (viirs_geotiff) kan läggas till senare.
  if (provider !== 'zones') {
    // fallback till zones om vi inte har annan provider aktiv
    // (Vill du hellre returnera null här, byt till: return null;)
  }

  const zones = CONFIG?.lightZones;
  if (!zones) return null;

  // Hitta närmaste definierade stad
  let bestKey = null, best = null, bestDist = Infinity;
  for (const [key, z] of Object.entries(zones)) {
    const d = haversineKm(lat, lon, z.center.lat, z.center.lon);
    if (d < bestDist) { bestDist = d; bestKey = key; best = z; }
  }
  if (!best) return null;

  // Trösklar (km) från config eller standard
  const urbanKm    = Number(best.urban_km ?? 2);
  const suburbanKm = Number(best.suburban_km ?? 5);

  let category = 'rural';
  let bortle   = 3;
  if (bestDist <= urbanKm) {
    category = 'urban_core';
    bortle = 8;
  } else if (bestDist <= suburbanKm) {
    category = 'suburban';
    bortle = 6;
  }

  return {
    source: 'zones',
    category,
    bortle,
    radiance: null, // kan fyllas när vi kopplar VIIRS
    detail: {
      cityKey: bestKey,
      ...best,
      distance_km: Math.round(bestDist * 10) / 10
    }
  };
}

export default { getLightPollution };
