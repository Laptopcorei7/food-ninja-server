const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { listPayments, addPayment, setDefault, removePayment } = require('../controllers/payment.controller');

router.use(protect);

router.get('/', listPayments);
router.post('/', addPayment);
router.put('/:id/default', setDefault);
router.delete('/:id', removePayment);

module.exports = router;
