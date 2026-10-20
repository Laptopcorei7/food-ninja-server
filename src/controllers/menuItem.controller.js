const mongoose = require('mongoose');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const Order = require('../models/Order');
const { handleError } = require('../utils/handleError');
const { parseListQuery, geoNearStage, pageFacet, pageResponse, roundDistance } = require('../utils/listQuery');

const SORT_STAGES = {
  distance: { distanceKm: 1, _id: 1 },
  rating: { rating: -1, _id: 1 },
  popular: { orderCount: -1, _id: 1 },
};

// For You score. Each part is scaled to 0..1, then weighted:
// category = share of the user's ordered dishes in this dish's category,
// restaurant = share of the user's ordered dishes from this restaurant,
// rating = rating / 5, nearness = 1 at the user's spot down to 0 at FOR_YOU_MAX_KM (0 without lat/lng).
const FOR_YOU_WEIGHTS = { category: 3, restaurant: 2, rating: 1, nearness: 1 };
const FOR_YOU_MAX_KM = 12; // used when lat/lng are sent without maxKm
const RECENT_DAYS = 2; // dishes ordered this recently are left out

// Value for `field` from parallel keys/values arrays, 0 when the key is missing
// ($arrayElemAt with -1 would return the last element).
const lookupValue = (keys, values, field) => ({
  $let: {
    vars: { i: { $indexOfArray: [keys, field] } },
    in: { $cond: [{ $gte: ['$$i', 0] }, { $arrayElemAt: [values, '$$i'] }, 0] },
  },
});

// Shared by GET /menu-items and /menu-items/for-you: filters from q plus `match`,
// distance from the user, `addFields` (e.g. a score), then `sort`, paged.
async function sendItems(res, q, { match = {}, addFields = {}, sort }) {
  const filter = { ...match };
  if (q.search) filter.name = q.search;
  if (q.categories.length) filter.category = { $in: q.categories };
  if (q.minRating !== null) filter.rating = { $gte: q.minRating };

  // An item's distance is its restaurant's distance, so find the restaurants in range
  // first and copy each one's distance onto its items.
  let distanceKm = null;
  if (q.point) {
    const nearby = await Restaurant.aggregate([geoNearStage(q), { $project: { distanceKm: 1 } }]);
    const ids = nearby.map((r) => r._id);
    filter.restaurantId = { ...filter.restaurantId, $in: ids };
    distanceKm = { $arrayElemAt: [nearby.map((r) => r.distanceKm), { $indexOfArray: [ids, '$restaurantId'] }] };
  }

  // priceRange covers every filter except maxPrice, so the app's price slider keeps
  // fixed ends while the user drags it. maxPrice applies inside the page and count.
  const facet = pageFacet(q, [
    roundDistance,
    {
      $lookup: {
        from: Restaurant.collection.name,
        localField: 'restaurantId',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1 } }],
        as: 'restaurant',
      },
    },
    { $set: { restaurant: { $first: '$restaurant' } } },
    { $project: { testimonials: 0, score: 0 } },
  ]);
  if (q.maxPrice !== null) {
    const byPrice = { $match: { price: { $lte: q.maxPrice } } };
    facet.$facet.items.unshift(byPrice);
    facet.$facet.total.unshift(byPrice);
  }
  facet.$facet.priceRange = [{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }];

  const result = await MenuItem.aggregate([
    { $match: filter },
    { $addFields: { distanceKm } },
    ...(Object.keys(addFields).length ? [{ $addFields: addFields }] : []),
    { $sort: sort },
    facet,
  ]);

  const range = result[0].priceRange[0];
  const priceRange = range ? { min: range.min, max: range.max } : null;
  return res.json({ success: true, data: { ...pageResponse(result, q), priceRange } });
}

exports.listMenuItems = async (req, res) => {
  try {
    const q = parseListQuery(req.query);
    if (q.error) return res.status(400).json({ success: false, message: q.error });
    return await sendItems(res, q, { sort: SORT_STAGES[q.sort ?? 'popular'] });
  } catch (err) {
    return handleError(res, err);
  }
};

// Dishes ranked by the user's own placed orders (status other than pending).
// No orders yet: top rated, then nearest.
exports.forYou = async (req, res) => {
  try {
    const q = parseListQuery(req.query);
    if (q.error) return res.status(400).json({ success: false, message: q.error });
    if (q.point && !q.maxMeters) q.maxMeters = FOR_YOU_MAX_KM * 1000;

    const orders = await Order.find(
      { userId: req.user._id, status: { $ne: 'pending' } },
      'restaurantId items.menuItemId items.qty createdAt'
    ).lean();
    if (!orders.length) return await sendItems(res, q, { sort: { rating: -1, distanceKm: 1, _id: 1 } });

    const recentSince = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const recent = [];
    const qtyByItem = new Map(); // menuItemId -> qty
    const qtyByRestaurant = new Map(); // restaurantId -> qty
    for (const order of orders) {
      for (const item of order.items) {
        if (!item.menuItemId) continue;
        const id = String(item.menuItemId);
        const qty = item.qty || 1;
        qtyByItem.set(id, (qtyByItem.get(id) || 0) + qty);
        const rid = String(order.restaurantId);
        qtyByRestaurant.set(rid, (qtyByRestaurant.get(rid) || 0) + qty);
        if (order.createdAt.getTime() >= recentSince) recent.push(item.menuItemId);
      }
    }

    const ordered = await MenuItem.find({ _id: { $in: [...qtyByItem.keys()] } }, 'category').lean();
    const qtyByCategory = new Map();
    for (const item of ordered) {
      if (!item.category) continue;
      qtyByCategory.set(item.category, (qtyByCategory.get(item.category) || 0) + qtyByItem.get(String(item._id)));
    }

    const totalQty = [...qtyByRestaurant.values()].reduce((a, b) => a + b, 0);
    const restaurantIds = [...qtyByRestaurant.keys()].map((id) => new mongoose.Types.ObjectId(id));
    const share = (map) => [...map.values()].map((n) => n / totalQty);
    const maxKm = q.maxMeters / 1000;
    const W = FOR_YOU_WEIGHTS;

    const score = {
      $add: [
        { $multiply: [W.category, lookupValue([...qtyByCategory.keys()], share(qtyByCategory), '$category')] },
        { $multiply: [W.restaurant, lookupValue(restaurantIds, share(qtyByRestaurant), '$restaurantId')] },
        { $multiply: [W.rating, { $divide: [{ $ifNull: ['$rating', 0] }, 5] }] },
        q.point
          ? { $multiply: [W.nearness, { $max: [0, { $subtract: [1, { $divide: ['$distanceKm', maxKm] }] }] }] }
          : 0,
      ],
    };

    return await sendItems(res, q, {
      match: { _id: { $nin: recent } },
      addFields: { score },
      sort: { score: -1, rating: -1, _id: 1 },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.getMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item)
      return res.status(404).json({ success: false, message: 'Menu item not found' });

    return res.json({ success: true, data: item });
  } catch (err) {
    return handleError(res, err);
  }
};
