// server/db/client.js
import pkg from 'pg';
const { Pool } = pkg;

/** Välj anslutning: 1) Session Pooler (IPv4) om satt, annars 2) Direct connection */
const CONNECTION_STRING =
  process.env.SUPABASE_POOLER_URL ||
  process.env.DATABASE_URL ||
  '';

if (!CONNECTION_STRING) {
  console.error('[db] ❌ Ingen SUPABASE_POOLER_URL eller DATABASE_URL hittades i process.env');
}

const safe = CONNECTION_STRING
  ? CONNECTION_STRING.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@')
  : '(saknas)';
console.log('[db] använder:', safe);

export const pool = new Pool({
  connectionString: CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },       // Supabase kräver SSL
  // statement_timeout: 15000,              // (valfritt) tidsgräns per query i ms
});

/** Låg-nivå query (returnerar rows) */
export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

/** Hjälpare: förväntar EN rad (kastar om 0) */
export async function one(text, params) {
  const rows = await query(text, params);
  if (!rows.length) throw new Error('[db.one] No rows');
  return rows[0];
}

/** Hjälpare: returnerar alltid en array (även tom) */
export async function many(text, params) {
  return await query(text, params);
}

/** Healthcheck: enkel SELECT 1 */
export async function health() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (e) {
    console.error('[db.health] error:', e?.message || e);
    return false;
  }
}

/** Graceful shutdown */
function shutdown() {
  console.log('[db] stänger pool...');
  pool.end().then(() => {
    console.log('[db] pool stängd');
    process.exit(0);
  }).catch(() => process.exit(1));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
