const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { faqs, contact } = require('../data/help');

router.use(protect);

// GET /help: FAQs and support contacts
router.get('/', (req, res) => res.json({ success: true, data: { faqs, contact } }));

module.exports = router;
