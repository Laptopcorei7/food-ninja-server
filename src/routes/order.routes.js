const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  getOrders,
  createOrder,
  getOrder,
  updateOrderItem,
  removeOrderItem,
  placeOrder,
} = require('../controllers/order.controller');

router.use(protect);

router.get('/', getOrders);
router.post('/', createOrder);
router.get('/:id', getOrder);
router.put('/:id/items/:itemId', updateOrderItem);
router.delete('/:id/items/:itemId', removeOrderItem);
router.post('/:id/place', placeOrder);

module.exports = router;
