const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { listMenuItems, getMenuItem } = require('../controllers/menuItem.controller');

router.use(protect);

router.get('/', listMenuItems);
router.get('/:id', getMenuItem);

module.exports = router;
