const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { handleError } = require('../utils/handleError');
const { parseListQuery, geoNearStage, pageFacet, pageResponse, roundDistance } = require('../utils/listQuery');

// Restaurants have no order count, so "popular" ranks by rating.
const SORT_STAGES = {
  distance: { distanceKm: 1, _id: 1 },
  rating: { rating: -1, _id: 1 },
  popular: { rating: -1, _id: 1 },
};

exports.listRestaurants = async (req, res) => {
  try {
    const q = parseListQuery(req.query);
    if (q.error) return res.status(400).json({ success: false, message: q.error });

    const match = {};
    if (q.search) match.name = q.search;
    if (q.categories.length) match.categories = { $in: q.categories };
    if (q.minRating !== null) match.rating = { $gte: q.minRating };

    const sort = q.sort ?? (q.point ? 'distance' : 'rating');
    const result = await Restaurant.aggregate([
      ...(q.point
        ? [geoNearStage(q, match)]
        : [{ $match: match }, { $addFields: { distanceKm: null } }]),
      { $sort: SORT_STAGES[sort] },
      pageFacet(q, [roundDistance]),
    ]);

    return res.json({ success: true, data: pageResponse(result, q) });
  } catch (err) {
    return handleError(res, err);
  }
};

// Optional lat/lng add distanceKm (null without them), same as the list.
exports.getRestaurant = async (req, res) => {
  try {
    const q = parseListQuery(req.query);
    if (q.error) return res.status(400).json({ success: false, message: q.error });

    const restaurant = await Restaurant.findById(req.params.id)
      .populate({ path: 'popularMenu', options: { limit: 5 } });
    if (!restaurant)
      return res.status(404).json({ success: false, message: 'Restaurant not found' });

    const [near] = q.point
      ? await Restaurant.aggregate([geoNearStage(q, { _id: restaurant._id }), { $project: { distanceKm: 1 } }, roundDistance])
      : [];
    return res.json({ success: true, data: { ...restaurant.toObject(), distanceKm: near?.distanceKm ?? null } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.getRestaurantMenu = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      MenuItem.find({ restaurantId: req.params.id }).skip(skip).limit(Number(limit)),
      MenuItem.countDocuments({ restaurantId: req.params.id }),
    ]);

    return res.json({ success: true, data: items, total });
  } catch (err) {
    return handleError(res, err);
  }
};
