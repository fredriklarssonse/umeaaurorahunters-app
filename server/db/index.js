// server/db/index.js
import { Pool } from 'pg';
import dns from 'node:dns';

// Hjälper Windows/IPv6-miljöer att föredra IPv4, annars fastnar det lätt på ::1
if (dns.setDefaultResultOrder) {
  try { dns.setDefaultResultOrder('ipv4first'); } catch {}
}

const rawEnv =
  (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();

let pool = null;

function mask(connStr) {
  // postgres://user:****@host:port/db
  return (connStr || '').replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
}

function buildConnString() {
  if (!rawEnv) return '';

  const hostOverride = (process.env.AURORA_DB_HOST || '').trim();
  const portOverride = (process.env.AURORA_DB_PORT || '').trim();

  if (!hostOverride && !portOverride) return rawEnv;

  // Tillåt override (praktiskt för Supabase Session pooler IPv4 – port brukar vara 6543)
  try {
    const u = new URL(rawEnv);
    if (hostOverride) u.hostname = hostOverride;
    if (portOverride) u.port = portOverride;
    return u.toString();
  } catch {
    // Om URL är ovanlig, fall tillbaka oförändrat
    return rawEnv;
  }
}

export function getPool() {
  if (pool) return pool;

  const connStr = buildConnString();
  if (!connStr) {
    console.warn('[db] Ingen DATABASE_URL/SUPABASE_DB_URL satt – DB inaktiverad.');
    return null;
  }

  pool = new Pool({
    connectionString: connStr,
    // Supabase kräver SSL; self-signed i dev → disable CA-kontroll
    ssl: { rejectUnauthorized: false },
    max: Number(process.env.DB_MAX || 5),
    idleTimeoutMillis: 30_000,
    statement_timeout: 20_000,
    connectionTimeoutMillis: 5_000
  });

  pool.on('error', (err) => {
    console.error('[db] Pool error:', err?.code || err?.message, err);
  });

  console.log('[db] Pool skapad:', mask(connStr));
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DB_DISABLED');
  return p.query(text, params);
}
