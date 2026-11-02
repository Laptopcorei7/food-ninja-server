const { distanceKm } = require('./location');

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const MAX_POINTS = 200;

// Road route between two { latitude, longitude } points from the public OSRM demo
// server. Resolves to { points: [{ latitude, longitude }], distanceM, durationS };
// throws on a network error, a timeout (5 s) or no route.
async function fetchRoute(from, to) {
  const url = `${OSRM_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YumQuick-server/1.0 (food delivery demo)' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`OSRM answered ${res.status}`);
  const body = await res.json();
  const route = body.routes?.[0];
  if (body.code !== 'Ok' || !route?.geometry?.coordinates?.length)
    throw new Error(`OSRM found no route (${body.code})`);
  // OSRM gives [lng, lat] pairs
  const points = thin(route.geometry.coordinates).map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  return { points, distanceM: route.distance, durationS: route.duration };
}

// At most MAX_POINTS, evenly spread, always keeping the first and last.
function thin(coords) {
  if (coords.length <= MAX_POINTS) return coords;
  const step = (coords.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => coords[Math.round(i * step)]);
}

// The point a fraction (0..1) of the way along the line, measured by distance.
function pointAlong(points, fraction) {
  const legs = points.slice(1).map((p, i) => distanceKm(points[i].latitude, points[i].longitude, p.latitude, p.longitude));
  let left = legs.reduce((a, b) => a + b, 0) * fraction;
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i] && legs[i] > 0) {
      const t = left / legs[i];
      const a = points[i];
      const b = points[i + 1];
      return { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t };
    }
    left -= legs[i];
  }
  const last = points[points.length - 1];
  return { latitude: last.latitude, longitude: last.longitude };
}

module.exports = { fetchRoute, pointAlong };
