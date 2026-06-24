const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { listVouchers } = require('../controllers/voucher.controller');

router.use(protect);

router.get('/', listVouchers);

module.exports = router;
