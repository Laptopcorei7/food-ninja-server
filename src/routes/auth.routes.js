const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  register,
  login,
  sendOTP,
  verifyOTP,
  forgotPassword,
  resetPassword,
  otpSend,
  otpVerify,
  deleteAccount,
} = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/signup', register);
router.post('/login', login);
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/otp/send', protect, otpSend);
router.post('/otp/verify', protect, otpVerify);
router.delete('/account', protect, deleteAccount);

module.exports = router;
