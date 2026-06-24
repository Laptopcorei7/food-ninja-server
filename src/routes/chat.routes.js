const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { listChats, getMessages, sendMessage } = require('../controllers/chat.controller');

router.use(protect);

router.get('/', listChats);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);

module.exports = router;
