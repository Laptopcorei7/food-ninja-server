const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getCart, addToCart } = require('../controllers/order.controller');

router.use(protect);

router.get('/', getCart);
router.post('/items', addToCart);

module.exports = router;
