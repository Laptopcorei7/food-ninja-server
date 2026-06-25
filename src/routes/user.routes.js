const router = require('express').Router();
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  getMe,
  updateProfile,
  uploadPhoto,
  updateLocation,
  listPaymentMethods,
  addPaymentMethod,
} = require('../controllers/user.controller');

router.use(protect);

router.get('/me', getMe);
router.patch('/me/profile', updateProfile);
router.post('/me/photo', upload.single('photo'), uploadPhoto);
router.patch('/me/location', updateLocation);
router.get('/me/payment-methods', listPaymentMethods);
router.post('/me/payment-methods', addPaymentMethod);

module.exports = router;
