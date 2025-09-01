// server/db.js
// En enda ingång till Postgres-poolen + hjälpfunktioner

import { getPool } from './db/index.js';

/** Kör valfri SQL med parametrar. Returnerar pg.Result */
export async function query(sql, params = []) {
  const pool = getPool();
  return pool.query(sql, params);
}

/** Hämtar exakt en rad (eller null). Kastar om >1 rad. */
export async function one(sql, params = []) {
  const { rows } = await query(sql, params);
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new Error('Expected exactly one row, got ' + rows.length);
  return rows[0];
}

/** Exponera pool vid behov (diagnostik etc.) */
export { getPool };
