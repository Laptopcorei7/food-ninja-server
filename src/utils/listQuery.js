// Shared params for GET /restaurants and GET /menu-items:
// search, category (repeated or comma-separated), lat, lng, maxKm, minRating, maxPrice, sort, page, limit.
// maxPrice only applies to menu items.
const CATEGORIES = require('./categories');

const SORTS = ['distance', 'rating', 'popular'];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function coordinate(value, max) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

// Optional numeric param: null when absent, NaN when not a finite number.
function number(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// Returns { error } for a bad request, otherwise the parsed options.
exports.parseListQuery = (query) => {
  const categories = [].concat(query.category ?? [])
    .flatMap((c) => String(c).split(','))
    .map((c) => c.trim())
    .filter(Boolean);
  const unknown = categories.find((c) => !CATEGORIES.includes(c));
  if (unknown) return { error: `Unknown category: ${unknown}` };

  let point = null;
  let maxMeters = null;
  if (query.lat !== undefined || query.lng !== undefined) {
    const lat = coordinate(query.lat, 90);
    const lng = coordinate(query.lng, 180);
    if (lat === null || lng === null) return { error: 'lat and lng must be sent together as valid coordinates' };
    point = { type: 'Point', coordinates: [lng, lat] };

    if (query.maxKm !== undefined) {
      const km = Number(query.maxKm);
      if (!(km > 0)) return { error: 'maxKm must be a positive number' };
      maxMeters = km * 1000;
    }
  }

  const minRating = number(query.minRating);
  if (Number.isNaN(minRating) || minRating < 0 || minRating > 5) return { error: 'minRating must be a number from 0 to 5' };
  const maxPrice = number(query.maxPrice);
  if (Number.isNaN(maxPrice) || maxPrice < 0) return { error: 'maxPrice must be a number of 0 or more' };

  if (query.sort !== undefined && !SORTS.includes(query.sort))
    return { error: `sort must be one of: ${SORTS.join(', ')}` };

  const search = typeof query.search === 'string' ? query.search.trim() : '';

  return {
    search: search ? new RegExp(escapeRegex(search), 'i') : null,
    categories,
    point,
    maxMeters,
    minRating,
    maxPrice,
    // distance needs a location; without one the caller's default applies
    sort: query.sort === 'distance' && !point ? undefined : query.sort,
    ...exports.parsePage(query),
  };
};

// page (default 1) and limit (default 20, max 50); bad values fall back to the defaults.
exports.parsePage = (query) => ({
  page: positiveInt(query.page, 1),
  limit: Math.min(positiveInt(query.limit, DEFAULT_LIMIT), MAX_LIMIT),
});

// First pipeline stage on restaurants: adds distanceKm from the user's location and
// applies maxKm. `query` is the rest of the filter ($geoNear allows no $match before it).
exports.geoNearStage = ({ point, maxMeters }, query = {}) => ({
  $geoNear: {
    near: point,
    distanceField: 'distanceKm',
    distanceMultiplier: 0.001,
    spherical: true,
    query,
    ...(maxMeters && { maxDistance: maxMeters }),
  },
});

// $facet stage that returns one page of items plus the total count.
// itemStages run on the page only (lookups, rounding).
exports.pageFacet = ({ page, limit }, itemStages = []) => ({
  $facet: {
    items: [{ $skip: (page - 1) * limit }, { $limit: limit }, ...itemStages],
    total: [{ $count: 'n' }],
  },
});

exports.pageResponse = ([result], { page, limit }) => {
  const total = result.total[0]?.n ?? 0;
  return { items: result.items, page, totalPages: Math.ceil(total / limit), total };
};

exports.roundDistance = { $addFields: { distanceKm: { $round: ['$distanceKm', 1] } } };
