// src/config/app-config.js
import path from 'path';

const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const resolveFromCwd = (p) =>
  p && path.isAbsolute(p) ? p : path.join(process.cwd(), p || '');

export const CONFIG = {
  /* ---------------- Weather (cache + multi-source consensus) ---------------- */
  weather: {
    cache: {
      dir: resolveFromCwd(process.env.WEATHER_CACHE_DIR || 'cache'),
      ttlMinutes: num(process.env.WEATHER_CACHE_TTL_MIN, 30),
    },
    sources: {
      // MET Norway kräver en vettig UA
      metUserAgent:
        process.env.MET_USER_AGENT ||
        'UmeaaAuroraHunters/1.0 (contact@example.com)',
    },
    consensus: {
      // Vikter (normaliseras automatiskt)
      weights: {
        met: num(process.env.WEIGHT_MET, 0.5),
        smhi: num(process.env.WEIGHT_SMHI, 0.3),
        openmeteo: num(process.env.WEIGHT_OPENMETEO, 0.2),
      },
      method: 'weighted-median',
      minSources: 1,
      // Oenighet i %-enheter mellan min/max
      disagreementThreshold: num(process.env.DISAGREE_THRESHOLD_PCT, 40),
      levels: {
        medium: num(process.env.DISAGREE_MEDIUM_PCT, 25),
        high: num(process.env.DISAGREE_HIGH_PCT, 40),
      },
    },
  },

  /* ---------------- Sightability (0..10) ---------------- */
sightability: {
  maxScore: 10,
  sunGateDeg: num(process.env.SUN_GATE_DEG, -8),
  weights: {
    sun: num(process.env.W_SUN, 1.0),
    clouds: num(process.env.W_CLOUDS, 1.6),
    moonLowGeo: num(process.env.W_MOON_LOWGEO, 1.2),
    moonHighGeo: num(process.env.W_MOON_HIGHGEO, 0.35)
  },
  // Mjuk skymningsdämpning mellan -8° och 0°
    twilight: {
    fromDeg: num(process.env.TWILIGHT_FROM_DEG, -8),
    toDeg:   num(process.env.TWILIGHT_TO_DEG,   0),
    allowanceMax: num(process.env.TWILIGHT_ALLOW_MAX, 0.35)
    }
},

  /* ---------------- Geomagnetic params + blending ---------------- */
  geomagnetic: {
    windowSize: num(process.env.GEO_WINDOW, 6), // timmar för SW-heuristik
    clampMin: 0,
    clampMax: 10,

    // Heuristik för SW-beräkning (behållna från tidigare)
    speedBands: [400, 500, 600, 700], // km/s
    speedScores: [0, 1, 2, 3, 4],
    bzBands: [-1, -3, -6, -10], // nT (mer negativt = bättre)
    bzScores: [1, 2, 3, 4],
    bzNorthPenaltyThreshold: +5, // nT
    bzNorthPenalty: -2,
    btBands: [10, 15, 20], // nT
    btScores: [1, 2, 3],
    densityBands: [1, 2, 5, 15, 30], // p/cc
    densityScores: [-2, -1, 0, 1, 0.5, 0],

    // Vilka extra index ska ingå
    sources: {
      use_hemi_power: true,
      use_ae: true,
      use_dst: false, // quicklook är preliminärt – slå på om du vill
    },

    // Vikter för slutlig global_score (0..10). Normaliseras på de källor som finns.
    blend: {
      w_hpo: num(process.env.W_HPO, 0.55), // Hp60
      w_kp: num(process.env.W_KP, 0.15),
      w_sw: num(process.env.W_SW, 0.10), // solarwind-heuristiken
      w_hemi: num(process.env.W_HEMI, 0.12), // hemispheric power
      w_ae: num(process.env.W_AE, 0.06),
      w_dst: num(process.env.W_DST, 0.02),
    },

    // Kartor → score(0..10) för aux-index
    maps: {
      hemiPowerGW: [
        [0, 0],
        [20, 2],
        [50, 5],
        [100, 8],
        [150, 10],
      ],
      aeNT: [
        [0, 0],
        [100, 2],
        [300, 5],
        [700, 8],
        [1200, 10],
      ],
      // |negativ Dst| (storm) → score
      dstNT: [
        [0, 0],
        [50, 2.5],
        [100, 5],
        [150, 7.5],
        [250, 10],
      ],
    },
  },

  /* ---------------- Solar wind fetch/sanity ---------------- */
  solarWind: {
    suspectLimits: {
      speedMin: 100,
      speedMax: 2000,
      densityMin: 0,
      densityMax: 60,
      btAbsMax: 100,
      bzAbsMax: 100,
    },
    sourcesOrder: ['swpc_products_2h', 'swpc_products_1d', 'ace_1h'],
    // hur vi flaggar ålder i logg/CLI
    staleHoursLevels: { fresh: 1, slight: 3, stale: 12 },
  },

  /* ---------------- Light pollution (MVP zoner) ---------------- */
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

  /* ---------------- Light pollution provider-val ---------------- */
lightPollution: {
  // 'zones'  = enkel zon-heuristik (rekommenderas just nu)
  // 'viirs_geotiff' = läs GeoTIFF (kräver fil + lib, annars faller vi tillbaka)
  // 'off'    = ignorera ljus helt
  provider: process.env.LIGHT_PROVIDER || 'zones',
  viirs: {
    tiffPath: process.env.LIGHT_VIIRS_TIFF || '' // absolut sökväg om du vill testa GeoTIFF senare
  }
},


  /* ---------------- Spot suggestions runt användaren ---------------- */
  spotSuggest: {
    ringDistancesKm: [1, 3, 5],
    bearingsDeg: [0, 45, 90, 135, 180, 225, 270, 315],
    preferNorthBonus: 0.5, // bonus om punkten ligger norr om användaren (330–30°)
    weights: {
      clouds: 0.7,
      light: 0.3,
    },
    // 'openmeteo_only' | 'multi'
    weatherMode: process.env.SPOT_WEATHER_MODE || 'openmeteo_only',
  },

  /* ---------------- Auroral oval / latitud-justering ---------------- */
  auroralOval: {
    kpBoundaryLat: {
      0: 67,
      1: 66,
      2: 64,
      3: 62,
      4: 60,
      5: 58,
      6: 56,
      7: 54,
      8: 52,
      9: 50,
    },
    // hur snabbt vi “dör av” söder om gränsen: 10° → 0
    falloffDeg: 10,
  },

  /* ---------------- HPO (Hp60/Hp30) källor ---------------- */
  hpo: {
    provider: process.env.HPO_PROVIDER || 'gfz',
    cacheTtlMin: num(process.env.HPO_TTL_MIN, 30),
    urls: {
      hp60_json:
        process.env.HPO_HP60_JSON ||
        'https://spaceweather.gfz.de/fileadmin/SW-Monitor/hp60_product_file_FORECAST_HP60_SWIFT_DRIVEN_LAST.json',
      hp30_json:
        process.env.HPO_HP30_JSON ||
        'https://spaceweather.gfz.de/fileadmin/SW-Monitor/hp30_product_file_FORECAST_HP30_SWIFT_DRIVEN_LAST.json',
    },
  },

  /* ---------------- Kp forecast källor (valfri) ---------------- */
  kp: {
    cacheTtlMin: num(process.env.KP_TTL_MIN, 30),
    urls: {
      hourly_json: process.env.KP_HOURLY_JSON || '',
      hourly_csv: process.env.KP_HOURLY_CSV || '',
    },
  },

hourly: {
  useHourlyAstroForCurrent: false  // vi använder INTE hourly-tabell för "Nu" (tabellen saknas)
},

};
