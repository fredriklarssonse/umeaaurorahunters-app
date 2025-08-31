// src/lib/api/base.js
import { PUBLIC_API_BASE } from '$env/static/public';

const BASE = (PUBLIC_API_BASE || '').replace(/\/+$/, '');

export async function apiGet(path) {
  const url = (BASE ? BASE : '') + path;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || url}`);
  }
  return res.json();
}
