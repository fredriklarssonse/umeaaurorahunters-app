// src/lib/lightpollution/get-lightpollution.js
import { CONFIG } from '../../config/app-config.js';
import { classifyLightByCityZone } from '../light/urban-indicator.js';
import fs from 'fs/promises';
import { fromArrayBuffer, fromUrl } from 'geotiff';

const provider = CONFIG.lightPollution.provider;
const wantViirs = provider === 'viirs_geotiff' || (provider === 'auto' && CONFIG.lightPollution.viirs.tiffPath);
if (wantViirs) { /* försök VIIRS; annars fall back */ }

let _viirs = null; // { image,bbox,width,height } | false

async function openViirs() {
  if (_viirs !== null) return _viirs;
  const tiffPath = CONFIG.lightPollution.viirs.tiffPath;
  if (!tiffPath) return (_viirs = false);

  try {
    // Stöd både lokalt filsystem och http(s)
    const isHttp = /^https?:\/\//i.test(tiffPath);
    const tiff = isHttp
      ? await fromUrl(tiffPath)                         // COG via HTTP
      : await (async () => {                            // Lokal fil
          const buf = await fs.readFile(tiffPath);
          return fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        })();

    const image = await tiff.getImage();
    const bbox = image.getBoundingBox(); // [minLon, minLat, maxLon, maxLat] (för EPSG:4326)
    const width = image.getWidth();
    const height = image.getHeight();
    return (_viirs = { image, bbox, width, height });
  } catch (e) {
    console.warn('[VIIRS] Open failed:', e.message);
    return (_viirs = false);
  }
}

// Sampla närmaste pixel
async function sampleViirsNearest(viirs, lat, lon) {
  const { image, bbox, width, height } = viirs;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return null;

  const x = Math.round(((lon - minLon) / (maxLon - minLon)) * (width - 1));
  const y = Math.round(((maxLat - lat) / (maxLat - minLat)) * (height - 1));

  const r = await image.readRasters({ window: [x, y, x + 1, y + 1] });
  // readRasters kan returnera antingen en array av band eller en typad array.
  let v = null;
  if (Array.isArray(r)) {
    const band0 = r[0];
    v = (Array.isArray(band0) || band0?.length !== undefined) ? band0[0] : null;
  } else if (r?.length !== undefined) {
    v = r[0];
  }
  return Number.isFinite(v) ? Number(v) : null;
}

function categorizeRadiance(rad) {
  const B = CONFIG.lightPollution.radianceBands;
  const cats = CONFIG.lightPollution.radianceToCategory;
  const bort = CONFIG.lightPollution.radianceToBortle;
  if (rad == null) return { category: 'unknown', bortle: null };
  let idx = 0;
  while (idx < B.length && rad >= B[idx]) idx++;
  return { category: cats[idx] || cats[cats.length - 1], bortle: bort[idx] || bort[bort.length - 1] };
}

/**
 * getLightPollution(lat, lon, locKeyForZones?) -> { source, category, bortle, radiance, scoreLight, detail }
 */
export async function getLightPollution(lat, lon, locKeyForZones = null) {
  if (CONFIG.lightPollution.provider === 'viirs_geotiff') {
    const viirs = await openViirs();
    if (viirs) {
      const radiance = await sampleViirsNearest(viirs, lat, lon);
      const { category, bortle } = categorizeRadiance(radiance);
      const scoreLight = CONFIG.lightPollution.categoryLightScore[category] ?? 0.5;
      return {
        source: 'viirs_geotiff',
        category, bortle, radiance,
        scoreLight,
        detail: { note: 'VIIRS Annual VNL (GeoTIFF)', bands: 'radiance' }
      };
    }
    // fall-through till zoner om öppning/sampling misslyckas
  }

  // Fallback: zoner (urban/suburban/rural) via stadskärne-avstånd (MVP)
  const key = locKeyForZones || CONFIG.lightPollution.zonesFallbackKey;
  const z = classifyLightByCityZone(key, lat, lon);
  const map = { urban: ['urban_core', 8], suburban: ['suburban', 6], rural: ['rural', 3], unknown: ['suburban', 6] };
  const [category, bortle] = map[z.class] || ['suburban', 6];
  const scoreLight = CONFIG.lightPollution.categoryLightScore[category] ?? z.scoreLight ?? 0.6;

  return {
    source: 'zones',
    category, bortle, radiance: null,
    scoreLight,
    detail: { distanceKm: z.distanceKm, cityName: z.cityName }
  };
}
