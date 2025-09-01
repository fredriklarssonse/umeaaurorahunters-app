// server/config.js
export const config = {
  // DB-url läses i db/index.js (DATABASE_URL / SUPABASE_DB_URL)
  forceMock: process.env.AURORA_FORCE_MOCK === '1' || process.env.AURORA_FORCE_MOCK === 'true',
  // fallback-tid (h) för "kväll" om astrodata saknas
  eveningMinHours: Number(process.env.AURORA_EVENING_MIN_HOURS || 6),
  // default location om param saknas
  defaultLocation: { name: 'Umeå', lat: 63.8258, lon: 20.263 },
};
