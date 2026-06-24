const router = require('express').Router();
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getMe, updateProfile, uploadPhoto, updateLocation } = require('../controllers/user.controller');

router.use(protect);

router.get('/me', getMe);
router.put('/profile', updateProfile);
router.put('/photo', upload.single('photo'), uploadPhoto);
router.put('/location', updateLocation);

module.exports = router;
