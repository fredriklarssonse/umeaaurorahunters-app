// src/lib/locations/resolve-location.js
import { dbSelect, dbInsert } from '../db/client-supa.js';

// enkel slugifierare: "Östersund kommun" -> "ostersund-kommun"
function slugify(s) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')  // diakriter
    .replace(/å/gi, 'a')
    .replace(/ä/gi, 'a')
    .replace(/ö/gi, 'o')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Haversine (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * resolveLocation({ lat, lon, name? })
 * - Försök matcha befintlig plats via slug(name) eller närmaste inom 5 km.
 * - Om ingen träff: skapa ny plats (name || "lat, lon"), lägg alias om name fanns.
 * Returnerar { id, name, lat, lon } (kanonisk plats)
 */
export async function resolveLocation({ lat, lon, name }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('resolveLocation: invalid lat/lon');
  }
  const providedName = (name || '').trim();
  const providedSlug = providedName ? slugify(providedName) : null;

  // 1) Namn-träff (slug)
  if (providedSlug) {
    const bySlug = await dbSelect('aurora_locations', q => q.eq('slug', providedSlug)).catch(()=>[]);
    if (bySlug?.length) return bySlug[0];
  }

  // 2) Närmaste inom ~5 km (hämta bounding box i DB, mät haversine i minnet)
  const latBox = 0.2, lonBox = 0.5; // grov bounding
  let nearby = await dbSelect('aurora_locations', q =>
    q.gte('lat', lat - latBox).lte('lat', lat + latBox)
     .gte('lon', lon - lonBox).lte('lon', lon + lonBox)
  ).catch(()=>[]);
  if (nearby?.length) {
    nearby = nearby
      .map(r => ({ ...r, dKm: haversineKm(lat, lon, r.lat, r.lon) }))
      .sort((a,b) => a.dKm - b.dKm);
    if (nearby[0] && nearby[0].dKm <= 5) {
      return nearby[0]; // återanvänd närmaste plats
    }
  }

  // 3) Skapa ny
  const canonicalName = providedName || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  const slug = slugify(canonicalName) || `${lat.toFixed(3)}-${lon.toFixed(3)}`.replace(/[^\d\-\.]/g,'');
  const [created] = await dbInsert('aurora_locations', [{
    name: canonicalName,
    slug,
    lat, lon,
    source: providedName ? 'user' : 'system'
  }]);

  // 4) Alias om användaren gav ett annat namn
  if (providedName && providedName.toLowerCase() !== canonicalName.toLowerCase()) {
    await dbInsert('aurora_location_aliases', [{
      location_id: created.id,
      alias: providedName
    }]).catch(()=>{ /* ignore dup */ });
  }

  return created;
}
