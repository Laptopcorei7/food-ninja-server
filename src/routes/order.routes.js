const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  getOrders,
  createOrder,
  getOrder,
  updateOrderItem,
  removeOrderItem,
  deleteOrder,
  advanceOrder,
  cancelOrder,
  getTracking,
  reviewOrder,
  reorder,
} = require('../controllers/order.controller');

router.use(protect);

router.get('/', getOrders);
router.post('/', createOrder);
router.get('/:id', getOrder);
router.delete('/:id', deleteOrder);
router.put('/:id/items/:itemId', updateOrderItem);
router.delete('/:id/items/:itemId', removeOrderItem);
router.post('/:id/cancel', cancelOrder);
router.get('/:id/tracking', getTracking);
router.post('/:id/review', reviewOrder);
router.post('/:id/reorder', reorder);
// Dev only: stands in for the restaurant and rider until they have their own apps
if (process.env.NODE_ENV !== 'production') router.post('/:id/advance', advanceOrder);

module.exports = router;
