const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getCallToken } = require('../controllers/call.controller');

router.use(protect);

router.post('/token', getCallToken);

module.exports = router;
