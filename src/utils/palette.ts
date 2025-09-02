export type TwilightKey = 'astronomy.twilight.civil' | 'astronomy.twilight.nautical' | 'astronomy.twilight.astronomical' | 'astronomy.twilight.astro_dark';


export function twilightOpacity(key: TwilightKey): number {
switch (key) {
case 'astronomy.twilight.civil': return 0.25;
case 'astronomy.twilight.nautical': return 0.55;
case 'astronomy.twilight.astronomical': return 0.80;
case 'astronomy.twilight.astro_dark': return 0.95;
}
}


// Färgkanaler (nycklar) — mappas till riktiga färger i ert theme
export const UI_KEYS = {
layers: {
grid: 'ui.tonight.layers.grid',
kp: 'ui.tonight.layers.kp',
clouds: 'ui.tonight.layers.clouds',
moon: 'ui.tonight.layers.moon',
twilight: 'ui.tonight.layers.twilight',
},
legend: {
kp: 'ui.tonight.legend.kp',
clouds: 'ui.tonight.legend.clouds',
moon: 'ui.tonight.legend.moon',
}
} as const;