const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { listNotifications, markRead } = require('../controllers/notification.controller');

router.use(protect);

router.get('/', listNotifications);
router.put('/:id/read', markRead);

module.exports = router;
