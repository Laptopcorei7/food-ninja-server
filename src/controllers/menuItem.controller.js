const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const { handleError } = require('../utils/handleError');
const { parseListQuery, geoNearStage, pageFacet, pageResponse, roundDistance } = require('../utils/listQuery');

const SORT_STAGES = {
  distance: { distanceKm: 1, _id: 1 },
  rating: { rating: -1, _id: 1 },
  popular: { orderCount: -1, _id: 1 },
};

exports.listMenuItems = async (req, res) => {
  try {
    const q = parseListQuery(req.query);
    if (q.error) return res.status(400).json({ success: false, message: q.error });

    const match = {};
    if (q.search) match.name = q.search;
    if (q.categories.length) match.category = { $in: q.categories };

    // An item's distance is its restaurant's distance, so find the restaurants in range
    // first and copy each one's distance onto its items.
    let distanceKm = null;
    if (q.point) {
      const nearby = await Restaurant.aggregate([geoNearStage(q), { $project: { distanceKm: 1 } }]);
      const ids = nearby.map((r) => r._id);
      match.restaurantId = { $in: ids };
      distanceKm = { $arrayElemAt: [nearby.map((r) => r.distanceKm), { $indexOfArray: [ids, '$restaurantId'] }] };
    }

    const result = await MenuItem.aggregate([
      { $match: match },
      { $addFields: { distanceKm } },
      { $sort: SORT_STAGES[q.sort ?? 'popular'] },
      pageFacet(q, [
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
        { $project: { testimonials: 0 } },
      ]),
    ]);

    return res.json({ success: true, data: pageResponse(result, q) });
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
