const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  register,
  login,
  sendOTP,
  verifyOTP,
  forgotPassword,
  resetPassword,
  deleteAccount,
} = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/signup', register);
router.post('/login', login);
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.delete('/account', protect, deleteAccount);

module.exports = router;
