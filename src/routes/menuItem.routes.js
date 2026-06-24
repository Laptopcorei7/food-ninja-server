const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getMenuItem } = require('../controllers/menuItem.controller');

router.use(protect);

router.get('/:id', getMenuItem);

module.exports = router;
