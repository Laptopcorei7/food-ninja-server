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
} = require('../controllers/order.controller');

router.use(protect);

router.get('/', getOrders);
router.post('/', createOrder);
router.get('/:id', getOrder);
router.delete('/:id', deleteOrder);
router.put('/:id/items/:itemId', updateOrderItem);
router.delete('/:id/items/:itemId', removeOrderItem);
// Dev only: stands in for the restaurant and driver until phase 6
if (process.env.NODE_ENV !== 'production') router.post('/:id/advance', advanceOrder);

module.exports = router;
