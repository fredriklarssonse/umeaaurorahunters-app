// src/lib/api/current.js
import { apiGet } from './client.js';

export function currentUrl({ lat, lon, location }) {
  if (lat != null && lon != null) {
    return `/forecast/current?lat=${lat}&lon=${lon}`;
  }
  return `/forecast/current?location=${encodeURIComponent(location || 'umea')}`;
}

export async function getCurrent(params, fetchFn = fetch) {
  return apiGet(currentUrl(params), fetchFn);
}
