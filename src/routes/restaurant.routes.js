const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { listRestaurants, getRestaurant, getRestaurantMenu } = require('../controllers/restaurant.controller');

router.use(protect);

router.get('/', listRestaurants);
router.get('/:id', getRestaurant);
router.get('/:id/menu', getRestaurantMenu);

module.exports = router;
