// server/db.js
import pg from 'pg';
import { parse } from 'pg-connection-string';

const { Pool } = pg;

const raw = process.env.DATABASE_URL || '';
if (!raw) {
  console.warn('[db] DATABASE_URL saknas – DB kommer inte vara tillgänglig');
}

const cfg = raw ? parse(raw) : {};

// Supabase kräver SSL.
// rejectUnauthorized:false är normalt ok i dev (Supabase har giltigt cert ändå).
const ssl =
  process.env.PGSSL === 'disable'
    ? false
    : { rejectUnauthorized: false };

export const pool = raw
  ? new Pool({
      host: cfg.host,
      port: cfg.port ? Number(cfg.port) : 5432,
      database: cfg.database || 'postgres',
      user: cfg.user || 'postgres',
      password: cfg.password,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
      ssl
    })
  : null;

// Hjälp-funktion som ger tydligare fel om pool saknas
export async function dbQuery(sql, params = []) {
  if (!pool) {
    throw new Error('DB_NOT_CONFIGURED');
  }
  return pool.query(sql, params);
}
