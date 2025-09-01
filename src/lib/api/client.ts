// src/lib/api/client.ts
export type TimelinePoint = {
  ts: string; // ISO
  potential: number; // 0-10
  visibility: number; // 0-10
  breakdown: {
    potential: Array<{ code: string; params: Record<string, any> }>;
    visibility: Array<{ code: string; params: Record<string, any> }>;
  };
};

export type EveningResponse = {
  meta: { version: number; unit: 'score0_10' };
  location: { name: string; lat: number; lon: number };
  now: {
    potential: number;
    visibility: number;
    i18n: { potential: string; visibility: string };
  };
  timeline_basic: TimelinePoint[];
  timeline_pro: TimelinePoint[];
};

export async function fetchEvening(params: { lat?: number; lon?: number; date?: string } = {}): Promise<EveningResponse> {
  const q = new URLSearchParams();
  if (params.lat != null) q.set('lat', String(params.lat));
  if (params.lon != null) q.set('lon', String(params.lon));
  if (params.date) q.set('date', params.date);

  const res = await fetch(`/api/evening?${q.toString()}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    throw new Error(`api.error.http_${res.status}`);
  }
  return await res.json();
}
