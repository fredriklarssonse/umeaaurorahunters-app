import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Loggar användarens valda plats
 * @param {string} location_name
 * @param {string} user_id (valfritt)
 * @param {number} lat
 * @param {number} lon
 */
export async function logUserLocation(location_name, user_id = null, lat = null, lon = null) {
  const row = { location_name, user_id, latitude: lat, longitude: lon, used_at: new Date() };
  const { error } = await supabase.from('user_location_log').insert([row]);
  if (error) throw error;
}