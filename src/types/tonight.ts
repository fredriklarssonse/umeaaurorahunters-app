export type TonightRow = {
ts_utc: string;
ts_local: string; // "YYYY-MM-DD HH:mm:ss" (lokal)
hour_label: string; // "HH:mm"
alpha: number; // 0..1 (0.95 max enligt SQL)
twilight: 'astronomy.twilight.civil' | 'astronomy.twilight.nautical' | 'astronomy.twilight.astronomical' | 'astronomy.twilight.astro_dark';
sun_alt: number;
moon_alt: number | null;
moon_illum: number | null; // 0..100
kp: number; // 0..9 (kan proxas vid brist på data)
cloud: number; // 0..100
};


export type TonightMeta = {
tz: string;
evening_day: string; // YYYY-MM-DD
from_utc: string;
to_utc: string;
from_local: string; // YYYY-MM-DD HH:mm:ss
to_local: string;
hours: number;
};


export type TonightBundle = {
status: 'ok' | 'error';
location: string;
meta: TonightMeta;
rows: TonightRow[];
};