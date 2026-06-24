const Rating = require('../models/Rating');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');

async function updateAverageRating(Model, targetId) {
  const ratings = await Rating.find({ targetId });
  if (!ratings.length) return;
  const avg = ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;
  await Model.findByIdAndUpdate(targetId, { rating: Math.round(avg * 10) / 10 });
}

exports.rateDriver = async (req, res) => {
  try {
    const { orderId, driverId, stars, feedback } = req.body;
    if (!orderId || !driverId || !stars)
      return res.status(400).json({ success: false, message: 'orderId, driverId, and stars are required' });

    const rating = await Rating.create({
      orderId,
      userId: req.user._id,
      targetId: driverId,
      targetType: 'driver',
      stars,
      feedback,
    });

    return res.status(201).json({ success: true, data: rating });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.rateFood = async (req, res) => {
  try {
    const { orderId, menuItemId, stars, feedback } = req.body;
    if (!orderId || !menuItemId || !stars)
      return res.status(400).json({ success: false, message: 'orderId, menuItemId, and stars are required' });

    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem)
      return res.status(404).json({ success: false, message: 'Menu item not found' });

    const rating = await Rating.create({
      orderId,
      userId: req.user._id,
      targetId: menuItemId,
      targetType: 'food',
      stars,
      feedback,
    });

    menuItem.testimonials.push({
      userId: req.user._id,
      userName: req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
      userPhotoUrl: req.user.photoUrl,
      stars,
      comment: feedback,
    });
    await menuItem.save();

    await updateAverageRating(MenuItem, menuItemId);

    return res.status(201).json({ success: true, data: rating });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.rateRestaurant = async (req, res) => {
  try {
    const { orderId, restaurantId, stars, feedback } = req.body;
    if (!orderId || !restaurantId || !stars)
      return res.status(400).json({ success: false, message: 'orderId, restaurantId, and stars are required' });

    const rating = await Rating.create({
      orderId,
      userId: req.user._id,
      targetId: restaurantId,
      targetType: 'restaurant',
      stars,
      feedback,
    });

    await updateAverageRating(Restaurant, restaurantId);

    return res.status(201).json({ success: true, data: rating });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
