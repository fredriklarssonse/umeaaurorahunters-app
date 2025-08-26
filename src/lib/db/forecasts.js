import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Default location
export const DEFAULT_LOCATION = "Umeå";

/**
 * Uppdaterar aktuell forecast
 * @param {string} location
 * @param {object} data - geomagnetic_score, kp_now, sightability_probability
 */
export async function upsertForecastCurrent(location, data) {
  const { error } = await supabase
    .from('aurora_forecast_current')
    .upsert([{ location_name: location, ...data, updated_at: new Date() }], { onConflict: 'location_name' });
  if (error) throw error;
}

/**
 * Sparar historik, endast för default-location
 */
export async function saveForecastHistory(data) {
  const row = { location_name: DEFAULT_LOCATION, created_at: new Date(), ...data };
  const { error } = await supabase.from('aurora_forecast_history').insert([row]);
  if (error) throw error;
}