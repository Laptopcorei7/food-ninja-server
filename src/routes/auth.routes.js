const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const { protect } = require('../middleware/auth');

// Per-IP caps on the code endpoints: sending costs an SMS, verifying is guessable.
// Off under jest, where every request comes from the same address.
const limiter = (limit) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { success: false, message: 'Too many attempts, try again in 15 minutes' },
});
const sendLimit = limiter(5);
const verifyLimit = limiter(20);
const {
  register,
  login,
  sendOTP,
  verifyOTP,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  otpSend,
  otpVerify,
  deleteAccount,
} = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/signup', register);
router.post('/login', login);
router.post('/send-otp', sendLimit, sendOTP);
router.post('/verify-otp', verifyLimit, verifyOTP);
router.post('/forgot-password', sendLimit, forgotPassword);
router.post('/forgot-password/verify', verifyLimit, verifyResetCode);
router.post('/reset-password', resetPassword);
router.post('/otp/send', sendLimit, protect, otpSend);
router.post('/otp/verify', verifyLimit, protect, otpVerify);
router.delete('/account', protect, deleteAccount);

module.exports = router;
