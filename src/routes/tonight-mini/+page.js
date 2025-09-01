export const ssr = false;
export const csr = true;

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
  try {
    const res = await fetch('/api/evening', { headers: { accept: 'application/json' } });
    const raw = await res.text();
    if (!res.ok) {
      return { status: res.status, error: `HTTP ${res.status}`, raw: raw?.slice(0, 500) ?? null };
    }

    let api = null;
    try { api = JSON.parse(raw); }
    catch (e) {
      return { status: res.status, error: `JSON parse error: ${String(e)}`, raw: raw?.slice(0, 500) ?? null };
    }

    // --- MAPPNING till vårt UI-kontrakt ---
    const location = {
      name: api?.location?.name ?? 'Umeå',
      coords: {
        lat: api?.location?.lat ?? 63.8258,
        lon: api?.location?.lon ?? 20.263
      }
    };

    const timeline = (api?.timeline_basic ?? []).map((p) => ({
      ts: p.ts,
      potential: Number(p.potential ?? 0),
      visibility: Number(p.visibility ?? 0),
      breakdown: p.breakdown ?? {}
    }));

    const now = api?.now ?? null;

    // observed kan saknas – defaulta till tomt
    const observed = api?.observed ?? [];

    const payload = { location, now, timeline, observed, meta: api?.meta ?? null };

    return { status: res.status, data: payload };
  } catch (e) {
    return { status: 0, error: e?.message || String(e), raw: null };
  }
}
