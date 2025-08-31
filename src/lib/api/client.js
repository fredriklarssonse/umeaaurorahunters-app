// src/lib/api/client.js
import { API_BASE } from '$lib/config/frontend-config.js';

export async function apiGet(path, fetchFn = fetch) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetchFn(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}
