// { address, latitude, longitude } as used by saved addresses and an order's deliveryAddress.

const inRange = (n, max) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;

// Error message for a bad location, or null. With partial = true, missing fields are allowed (PATCH).
function locationError(loc, { partial = false } = {}) {
  if (!loc || typeof loc !== 'object') return 'address, latitude and longitude are required';
  const { address, latitude, longitude } = loc;
  if (!(partial && address === undefined) && (typeof address !== 'string' || !address.trim()))
    return 'address is required';
  if (!(partial && latitude === undefined) && !inRange(latitude, 90))
    return 'latitude must be a number from -90 to 90';
  if (!(partial && longitude === undefined) && !inRange(longitude, 180))
    return 'longitude must be a number from -180 to 180';
  return null;
}

// Straight-line distance in km (haversine).
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

module.exports = { locationError, distanceKm };
