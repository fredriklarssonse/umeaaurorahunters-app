export type EveningResponse = {
  location: { name: string; lat: number; lon: number };
  now: { potential: number; visibility: number; i18n: { potential: string; visibility: string } };
  timeline_basic: Array<{ ts: string; potential: number; visibility: number }>;
};

export async function loadEvening(params: { lat?: number; lon?: number; date?: string } = {}) {
  const q = new URLSearchParams();
  if (params.lat != null) q.set('lat', String(params.lat));
  if (params.lon != null) q.set('lon', String(params.lon));
  if (params.date) q.set('date', params.date);
    const base = ''; // använd proxy i dev

    const r = await fetch(`/api/evening?${q.toString()}`, {
        headers: { Accept: 'application/json' }
    });

  if (!r.ok) throw new Error(`api.error.http_${r.status}`);
  return r.json() as Promise<EveningResponse>;
}
