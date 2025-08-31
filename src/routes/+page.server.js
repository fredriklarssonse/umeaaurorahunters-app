// SSR-load: hämtar current från API-lagret
import { getCurrent } from '$lib/api/current.js';

export async function load({ fetch, url }) {
  const lat  = url.searchParams.get('lat');
  const lon  = url.searchParams.get('lon');
  const loc  = url.searchParams.get('location') || 'umea';

  let current = null, err = null;
  try {
    current = await getCurrent(
      lat && lon ? { lat: Number(lat), lon: Number(lon) } : { location: loc },
      fetch
    );
  } catch (e) {
    err = e?.message || String(e);
  }

  return { current, err };
}
