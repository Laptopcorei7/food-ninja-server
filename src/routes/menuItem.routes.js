const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { listMenuItems, forYou, getMenuItem } = require('../controllers/menuItem.controller');

router.use(protect);

router.get('/', listMenuItems);
router.get('/for-you', forYou); // before /:id, or "for-you" is taken as an id
router.get('/:id', getMenuItem);

module.exports = router;
