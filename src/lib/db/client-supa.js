import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;

// Stöd både SUPABASE_SERVICE_ROLE_KEY och SUPABASE_SERVICE_KEY (ditt namn)
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

const KEY = SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_* key in environment');
}

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function dbSelect(table, builderFn) {
  let q = supabase.from(table).select('*');
  if (builderFn) q = builderFn(q);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function dbUpsert(table, rows, onConflict) {
  const { data, error } = await supabase
    .from(table)
    .upsert(rows, onConflict ? { onConflict } : {})
    .select();
  if (error) throw error;
  return data;
}
export async function dbInsert(table, rows) {
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw error;
  return data;
}
