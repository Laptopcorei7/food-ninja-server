const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getShipping, updateShipping } = require('../controllers/shipping.controller');

router.use(protect);

router.get('/:orderId', getShipping);
router.put('/:orderId', updateShipping);

module.exports = router;
