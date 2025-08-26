import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * saveData generellt med batch och onConflict
 * @param {string} tableName - ex 'aurora_solar_wind'
 * @param {array} data - array av objekt
 * @param {array} onConflict - fältnamn att undvika dubbletter
 */
export async function saveData(tableName, data, onConflict = []) {
  if (!data || data.length === 0) return;

  // Batch-insert
  const { error } = await supabase
    .from(tableName)
    .upsert(data, { onConflict });

  if (error) console.error(`Error saving data to ${tableName}:`, error);
  else console.log(`Saved ${data.length} rows to ${tableName}`);
}