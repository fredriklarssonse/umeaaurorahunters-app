// src/lib/db/client.js
import { createClient } from '@supabase/supabase-js';

// Läs in från .env (dotenv är redan aktiverat via -r dotenv/config)
const SUPABASE_URL  = process.env.SUPABASE_URL;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY; // valfri, men behövs för skrivningar

if (!SUPABASE_URL || !(ANON_KEY || SERVICE_KEY)) {
  console.warn(
    '[supabase] Varning: Saknar SUPABASE_URL eller API-nyckel. ' +
    'Sätt SUPABASE_URL och SUPABASE_ANON_KEY i .env (samt SUPABASE_SERVICE_ROLE_KEY om servern ska skriva).'
  );
}

// Servern ska kunna skriva när vi kör "fresh=1" (updateForecast skapar/uppdaterar rader).
// Därför använder vi service_role om den finns; annars faller vi tillbaka till anon.
const KEY = SERVICE_KEY || ANON_KEY;

export const supabase = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { 'x-client-info': 'umeaaurorahunters-api/1.0' }
  }
});
