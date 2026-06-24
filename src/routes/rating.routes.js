const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { rateDriver, rateFood, rateRestaurant } = require('../controllers/rating.controller');

router.use(protect);

router.post('/driver', rateDriver);
router.post('/food', rateFood);
router.post('/restaurant', rateRestaurant);

module.exports = router;
