// src/routes/tonight/+page.server.ts
import type { ServerLoad } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const SIM_BASE = 'http://localhost:5176/tonight-mini?sim=1';

async function fetchSim(fetchFn: typeof fetch, loc: string) {
  const url = `${SIM_BASE}&loc=${encodeURIComponent(loc)}`;
  const res = await fetchFn(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`sim fetch failed: ${res.status}`);
  const data = await res.json();
  return { payload: data?.data ?? data };
}

export const load: ServerLoad = async ({ url, fetch }) => {
  const loc = url.searchParams.get('loc') ?? '230f36f6-a519-4950-9003-3f8ffe41fdf3';
  const forceSim = url.searchParams.get('sim') === '1';

  if (forceSim) {
    return await fetchSim(fetch, loc);
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

  console.log('[tonight] env check', {
    urlLen: SUPABASE_URL?.length ?? 0,
    keyLen: SUPABASE_ANON_KEY?.length ?? 0
  });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[tonight] Missing SUPABASE_URL / SUPABASE_ANON_KEY. Using sim endpoint.');
    try {
      return await fetchSim(fetch, loc);
    } catch {
      return { payload: null, error: 'Saknar env och kunde inte hämta sim-data.' };
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch } });

  const { data, error } = await supabase.rpc('get_tonight_window_bundle_by_id', {
    p_location_id: loc,
    p_tz: 'Europe/Stockholm'
  });

  if (error) {
    console.error('[tonight] RPC error:', error.message);
    try {
      return await fetchSim(fetch, loc);
    } catch {
      return { payload: null, error: String(error.message) };
    }
  }

  return { payload: data?.data ?? data };
};
