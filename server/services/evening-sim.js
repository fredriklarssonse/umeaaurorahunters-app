// server/services/evening-sim.js
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function lerp(a,b,t){ return a + (b-a)*t; }

// enkel ”solhöjd” över kvällen: ljus -> skymning -> natt
function synthSunAlt(hourLocal) {
  // grov modell: >= 20 → nedanför -6 grad, före 20 -> ljus
  if (hourLocal < 18) return 5;        // dag
  if (hourLocal < 20) return lerp(5, -6, (hourLocal - 18) / 2);
  if (hourLocal < 23) return lerp(-6, -14, (hourLocal - 20) / 3);
  return -16; // nattdjup
}

// enkel månbana + illumination
function synthMoon(now, iHour) {
  // alt rör sig från -10 till +35 och ned igen över natten
  const alt = Math.sin((iHour / 8) * Math.PI) * 35 - 5; // ~ -5..+30
  // illumination 0.3..0.7
  const illum = 0.5 + 0.2 * Math.sin((now.getDate() % 29) / 29 * 2 * Math.PI);
  return { altDeg: alt, illum: clamp01(illum) };
}

// generera moln 0..1 med lite variation
function synthClouds(seed, i) {
  const rnd = (k) => {
    // deterministic-ish
    const x = Math.sin((seed + i*31 + k*17) * 43758.5453);
    return clamp01((x - Math.floor(x)));
  };
  const low = clamp01(0.15 + 0.6 * rnd(1));
  const mid = clamp01(0.10 + 0.5 * rnd(2));
  const high = clamp01(0.10 + 0.5 * rnd(3));
  return { low, mid, high };
}

function scoreVisibility({ sunAlt, moon, clouds }) {
  // mörker 0..1 (>=-6 → 0, <=-18 → 1)
  let dark;
  if (sunAlt >= -6) dark = 0;
  else if (sunAlt <= -18) dark = 1;
  else dark = (-(sunAlt) - 6) / 12;

  // måndämpning ~ upp om månen är hög och ljus
  const moonAtt = moon.altDeg > 0 ? clamp01(moon.illum * Math.min(1, moon.altDeg / 50)) : 0;

  // molntäcke – ta ungefär ”max” av lager
  const cover = Math.max(clouds.low, clouds.mid, clouds.high); // 0..1

  // synlighet ~ mörker * (1 - moln) * (1 - 0.7*moonAtt)
  const vis01 = clamp01(dark * (1 - cover) * (1 - 0.7 * moonAtt));

  return Math.round(vis01 * 10 * 10) / 10; // 0..10, en decimal
}

function scorePotential({ hp = 0.3, kp = 1.0 }) {
  // enkel potential ~ kombination av hp/kp skala 0..10
  const base = clamp01(0.1 + 0.6 * hp + 0.3 * (kp / 9));
  return Math.round(base * 10 * 10) / 10;
}

export function buildEveningSim({ name = 'Umeå', lat = 63.8258, lon = 20.263 } = {}) {
  const now = new Date();
  const localNow = new Date(now);
  // bygg 12 punkter från kl 18 → 06 (min 8h + marginal) och skär sedan ner i window
  const start = new Date(localNow);
  start.setHours(18, 0, 0, 0);

  const items = [];
  for (let h = 0; h < 13; h++) { // 18..06
    const ts = new Date(start.getTime() + h * 3600_000);
    const hourLocal = ts.getHours();
    const sunAlt = synthSunAlt(hourLocal);
    const moon = synthMoon(localNow, h);
    const clouds = synthClouds(now.getDate(), h);

    const visibility = scoreVisibility({ sunAlt, moon, clouds });

    // ge hp/kp lite lugn variation
    const hp = 0.2 + 0.6 * Math.abs(Math.sin((h + 1) * 0.6));
    const kp = 0.7 + 1.5 * Math.abs(Math.cos((h + 2) * 0.4)) * 2; // ~0.7..3.7
    const potential = scorePotential({ hp, kp });

    items.push({
      ts: ts.toISOString(),
      potential,
      visibility,
      breakdown: {
        visibility: [
          { code: 'breakdown.twilight', params: { elevationDeg: sunAlt } },
          { code: 'breakdown.moon', params: { illum: moon.illum, altDeg: moon.altDeg } },
          { code: 'breakdown.clouds', params: { low: clouds.low, mid: clouds.mid, high: clouds.high } }
        ]
      }
    });
  }

  return {
    location: { name, lat, lon },
    timeline: items,
    now: items[Math.min( items.length - 1, Math.max(0, 2) )] // ta en tidig punkt som ”nu”
  };
}
