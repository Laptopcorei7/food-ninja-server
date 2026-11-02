const router = require('express').Router();
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { listChats, getSupportChat, getMessages, sendMessage, sendPhoto } = require('../controllers/chat.controller');

router.use(protect);

router.get('/', listChats);
router.get('/support', getSupportChat);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.post('/:id/photo', upload.single('photo'), sendPhoto);

module.exports = router;
