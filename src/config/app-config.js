// src/config/app-config.js
import path from 'path';

const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const resolveFromCwd = (p) => (p && path.isAbsolute(p) ? p : path.join(process.cwd(), p || ''));

export const CONFIG = {
  // --- WEATHER (multi-source + konsensus) ---
  weather: {
    cache: {
      dir: resolveFromCwd(process.env.WEATHER_CACHE_DIR || 'cache'),
      ttlMinutes: num(process.env.WEATHER_CACHE_TTL_MIN, 30),
    },
    sources: {
      // MET Norway kräver User-Agent
      metUserAgent: process.env.MET_USER_AGENT || 'UmeaaAuroraHunters/1.0 (contact@example.com)',
    },
    consensus: {
      // Vikter (normaliseras internt)
      weights: {
        met:       num(process.env.WEIGHT_MET,       0.5),
        smhi:      num(process.env.WEIGHT_SMHI,      0.3),
        openmeteo: num(process.env.WEIGHT_OPENMETEO, 0.2),
      },
      method: 'weighted-median', // 'weighted-median' | 'median'
      minSources: 1,
      disagreementThreshold: num(process.env.DISAGREE_THRESHOLD_PCT, 40), // %-enheter
      levels: {
        medium: num(process.env.DISAGREE_MEDIUM_PCT, 25),
        high:   num(process.env.DISAGREE_HIGH_PCT,   40),
      },
    },
  },

  // --- SIGHTABILITY (inkl. ljusföroreningar) ---
  sightability: {
    maxScore: 10,
    sunGateDeg: num(process.env.SUN_GATE_DEG, -8),
    weights: {
      sun:         num(process.env.W_SUN,           1.0),
      clouds:      num(process.env.W_CLOUDS,        1.6),
      moonLowGeo:  num(process.env.W_MOON_LOWGEO,   1.2),
      moonHighGeo: num(process.env.W_MOON_HIGHGEO,  0.35),
      // ljus väger mer när geomagnetiken är svag, mindre när den är stark
      lightLowGeo:  num(process.env.W_LIGHT_LOWGEO,  1.0),
      lightHighGeo: num(process.env.W_LIGHT_HIGHGEO, 0.3),
    },
  },

  // --- GEOMAGNETIC SCORE ---
  geomagnetic: {
    windowSize: num(process.env.GEO_WINDOW, 6),
    clampMin: 0,
    clampMax: 10,
    // Trösklar/bidrag
    speedBands:  [400, 500, 600, 700],     // km/s
    speedScores: [0,   1,   2,   3,   4],
    bzBands:     [-1,  -3,  -6,  -10],     // nT (mer negativt = bättre)
    bzScores:    [1,   2,   3,   4],
    bzNorthPenaltyThreshold: +5,           // nT
    bzNorthPenalty: -2,
    btBands:     [10,  15,  20],           // nT
    btScores:    [1,   2,   3],
    densityBands:  [1,  2,  5,  15,  30],  // p/cc
    densityScores: [-2, -1, 0,  1,   0.5, 0],
  },

  // --- SOLAR WIND sanity / staleness ---
  solarWind: {
    suspectLimits: {
      speedMin: 100, speedMax: 2000,
      densityMin: 0, densityMax: 60,
      btAbsMax: 100, bzAbsMax: 100,
    },
    sourcesOrder: ['swpc_products_2h', 'swpc_products_1d', 'ace_1h'],
    staleHoursLevels: { fresh: 1, slight: 3, stale: 12 },
  },

  // --- LIGHT ZONES (MVP-fallback för ljus) ---
  lightZones: {
    umea: {
      name: 'Umeå',
      center: { lat: 63.825, lon: 20.263 },
      urban_km: 2.0,
      suburban_km: 5.0,
    },
    ostersund: {
      name: 'Östersund',
      center: { lat: 63.179, lon: 14.635 },
      urban_km: 2.0,
      suburban_km: 5.0,
    },
  },

  // --- SPOT SUGGEST (hitta mörkare platser nära) ---
  spotSuggest: {
    ringDistancesKm: [1, 3, 5],
    bearingsDeg: [0,45,90,135,180,225,270,315],
    preferNorthBonus: 0.5, // bonus om punkten ligger norrut (330–30°)
    weights: {
      clouds: 0.7,
      light:  0.3,
    },
    // 'openmeteo_only' (snabbt) eller 'multi' (dyrare men robust)
    weatherMode: process.env.SPOT_WEATHER_MODE || 'openmeteo_only',
  },

  // --- AURORAL OVAL (latitud-justering) ---
  auroralOval: {
    // ungefärlig ekvatorsida av ovalen per Kp (interpoleras)
    kpBoundaryLat: {
      0: 67, 1: 66, 2: 64, 3: 62, 4: 60,
      5: 58, 6: 56, 7: 54, 8: 52, 9: 50,
    },
    falloffDeg: 10, // 10° söder om gränsen → 0 faktor
  },

  // --- LIGHT POLLUTION provider (VIIRS GeoTIFF eller zoner) ---
  lightPollution: {
     provider: process.env.LIGHT_PROVIDER || 'zones', // sätt ev. 'auto'
    viirs: { tiffPath: process.env.LIGHT_VIIRS_TIFF || null },
    
    // Heuristisk mappning av VIIRS-radiance (nW/cm²/sr) → kategori/Bortle
    radianceBands:       [0.25, 1,   3,   8,   20],
    radianceToCategory: ['rural','rural_edge','suburban','urban_edge','urban_core','urban_core'],
    radianceToBortle:   [3,      4,           5,         6,           7,           8],
    categoryLightScore: { rural: 1.0, rural_edge: 0.85, suburban: 0.6, urban_edge: 0.3, urban_core: 0.1 },
    zonesFallbackKey: 'umea',
  },
};
