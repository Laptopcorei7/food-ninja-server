const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');

exports.listRestaurants = async (req, res) => {
  try {
    const { search, limit = 20, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };

    const [restaurants, total] = await Promise.all([
      Restaurant.find(filter).skip(skip).limit(Number(limit)),
      Restaurant.countDocuments(filter),
    ]);

    return res.json({ success: true, data: restaurants, total });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id)
      .populate({ path: 'popularMenu', options: { limit: 5 } });
    if (!restaurant)
      return res.status(404).json({ success: false, message: 'Restaurant not found' });

    return res.json({ success: true, data: restaurant });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
    return res.status(500).json({ success: false, message: err.message });
  }
};
