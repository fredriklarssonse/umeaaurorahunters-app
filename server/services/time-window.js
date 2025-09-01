// server/services/time-window.js
export function pickNightWindow(items, { minHours = 6 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return items;

  // Hitta block med sol_alt <= -6 (nautisk/astronomisk skymning)
  const isDark = (p) => {
    const tw = p?.breakdown?.visibility?.find((x) => x?.code === 'breakdown.twilight')?.params;
    const elev = typeof tw?.elevationDeg === 'number' ? tw.elevationDeg : null;
    return elev !== null ? elev <= -6 : null;
  };

  let first = -1, last = -1;
  for (let i = 0; i < items.length; i++) {
    const d = isDark(items[i]);
    if (d === null) continue; // ok, vi kanske kör simulering
    if (d && first === -1) first = i;
    if (d) last = i;
  }

  // Om vi hittade ett mörkerfönster, använd det men se till att det är minst minHours
  if (first !== -1 && last !== -1) {
    const slice = items.slice(first, last + 1);
    if (slice.length >= minHours) return slice;

    // för kort natt – expandera lika mycket på båda håll om det går
    let need = minHours - slice.length;
    let pre = Math.min(first, Math.floor(need / 2));
    let post = Math.min(items.length - 1 - last, need - pre);
    return items.slice(first - pre, last + 1 + post);
  }

  // Fallback: bygg ett tidsfönster ~20–04 lokalt (min 6h)
  // Antag 1h-steg i items, välj start ~ när timmen är 20–21.
  const byHour = items.map((p, i) => ({ i, hour: new Date(p.ts).getHours() }));
  let startIdx = byHour.find((x) => x.hour >= 20 && x.hour <= 21)?.i ?? 0;

  // target 8h
  const want = Math.max(minHours, 8);
  const endIdx = Math.min(items.length, startIdx + want);
  const chosen = items.slice(startIdx, endIdx);
  if (chosen.length >= minHours) return chosen;

  // sista fallback – ta sista minHours
  return items.slice(-minHours);
}
