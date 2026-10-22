const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getCart, addToCart, checkVoucher, placeCart } = require('../controllers/order.controller');

router.use(protect);

router.get('/', getCart);
router.post('/items', addToCart);
router.post('/voucher', checkVoucher);
router.post('/place', placeCart);

module.exports = router;
