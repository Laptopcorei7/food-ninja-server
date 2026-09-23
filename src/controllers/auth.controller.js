const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { generateToken } = require('../utils/generateToken');
const { generateOTP } = require('../utils/generateOTP');
const { sendOTP } = require('../utils/sendOTP');
const { isE164, E164_MESSAGE } = require('../utils/phone');
const { handleError } = require('../utils/handleError');

const MAX_OTP_ATTEMPTS = 5;

// Every verify call spends one attempt, counted atomically so parallel guesses can't
// all read the same count. Returns { otp } on success or { reason: 'invalid' | 'expired' }.
async function consumeOTP(contact, code, purpose) {
  const otp = await OTP.findOneAndUpdate(
    { contact, purpose, used: false, attempts: { $lt: MAX_OTP_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!otp || otp.code !== String(code)) return { reason: 'invalid' };
  if (otp.expiresAt < new Date()) return { reason: 'expired' };

  const claimed = await OTP.findOneAndUpdate({ _id: otp._id, used: false }, { used: true }, { new: true });
  return claimed ? { otp: claimed } : { reason: 'invalid' };
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'name, email, and password are required' });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    return res.status(201).json({
      success: true,
      data: { token: generateToken(user._id), user },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'email and password are required' });

    const user = await User.findOne({ email });
    const match = user && (await bcrypt.compare(password, user.password));
    if (!match)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    return res.status(200).json({
      success: true,
      data: { token: generateToken(user._id), user },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.sendOTP = async (req, res) => {
  try {
    const { phoneNumber, purpose } = req.body;
    if (!phoneNumber || !purpose)
      return res.status(400).json({ success: false, message: 'phoneNumber and purpose are required' });

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 90 * 1000);

    await OTP.findOneAndDelete({ contact: phoneNumber, purpose, used: false });
    await OTP.create({ contact: phoneNumber, code, purpose, expiresAt, used: false });

    await sendOTP(phoneNumber, code, 'sms');

    return res.status(200).json({ success: true, data: { message: 'OTP sent' } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { phoneNumber, code, purpose } = req.body;
    if (!phoneNumber || !code || !purpose)
      return res.status(400).json({ success: false, message: 'phoneNumber, code, and purpose are required' });

    const { reason } = await consumeOTP(phoneNumber, code, purpose);
    if (reason)
      return res.status(400).json({ success: false, message: reason === 'expired' ? 'OTP expired' : 'Invalid OTP' });

    return res.status(200).json({ success: true, data: { message: 'OTP verified' } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { method } = req.body;
    if (!['sms', 'email'].includes(method) || !req.body.contact)
      return res.status(400).json({ success: false, message: 'method (sms or email) and contact are required' });

    const contact = method === 'email' ? req.body.contact.trim().toLowerCase() : req.body.contact.trim();
    const sent = { success: true, data: { message: 'Reset code sent' } };

    // Same response when no account matches, so the endpoint can't be used to probe for accounts
    const user = await User.findOne(method === 'email' ? { email: contact } : { phoneNumber: contact });
    if (!user) return res.status(200).json(sent);

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 90 * 1000);

    await OTP.findOneAndDelete({ contact, purpose: 'forgot_password', used: false });
    await OTP.create({ contact, code, purpose: 'forgot_password', expiresAt, used: false });

    await sendOTP(contact, code, method);

    return res.status(200).json(sent);
  } catch (err) {
    return handleError(res, err);
  }
};

// The reset token is signed with the user's current password hash mixed into the secret:
// protect() can't verify it (so it never works as a login token), and it stops verifying
// once the password changes (so it works once).
const resetSecret = (user) => process.env.JWT_SECRET + user.password;

exports.verifyResetCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!req.body.contact || !code)
      return res.status(400).json({ success: false, message: 'contact and code are required' });

    const contact = req.body.contact.trim();
    const { otp, reason } = await consumeOTP({ $in: [contact, contact.toLowerCase()] }, code, 'forgot_password');
    if (reason)
      return res.status(400).json({ success: false, message: reason === 'expired' ? 'Code expired' : 'Invalid code' });

    const user = await User.findOne({ $or: [{ email: otp.contact }, { phoneNumber: otp.contact }] });
    if (!user)
      return res.status(400).json({ success: false, message: 'Invalid code' });

    const resetToken = jwt.sign({ id: user._id }, resetSecret(user), { expiresIn: '10m' });
    return res.status(200).json({ success: true, data: { resetToken } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;
    if (!resetToken || !newPassword || !confirmPassword)
      return res.status(400).json({
        success: false,
        message: 'resetToken, newPassword, and confirmPassword are required',
      });

    if (newPassword !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });

    const invalid = { success: false, message: 'Reset link invalid or expired, request a new code' };
    const user = await User.findById(jwt.decode(resetToken)?.id);
    if (!user) return res.status(400).json(invalid);
    try {
      jwt.verify(resetToken, resetSecret(user));
    } catch (err) {
      return res.status(400).json(invalid);
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({ success: true, data: { message: 'Password reset successful' } });
  } catch (err) {
    return handleError(res, err);
  }
};

// Protected OTP send — saves phone to user profile, sends OTP via SMS
exports.otpSend = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone)
      return res.status(400).json({ success: false, message: 'phone is required' });
    if (!isE164(phone))
      return res.status(400).json({ success: false, message: E164_MESSAGE });

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 90 * 1000);

    await OTP.deleteMany({ contact: phone, purpose: 'verify_phone', used: false });
    await OTP.create({ contact: phone, code, purpose: 'verify_phone', expiresAt, used: false });
    await User.findByIdAndUpdate(req.user._id, { phoneNumber: phone });

    await sendOTP(phone, code, 'sms');

    return res.json({ success: true, data: { message: 'OTP sent to your phone' } });
  } catch (err) {
    return handleError(res, err);
  }
};

// Protected OTP verify — looks up OTP by user's saved phone number
exports.otpVerify = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp)
      return res.status(400).json({ success: false, message: 'otp is required' });

    const user = await User.findById(req.user._id);
    if (!user.phoneNumber)
      return res.status(400).json({ success: false, message: 'No phone number on file. Call /auth/otp/send first.' });

    const { reason } = await consumeOTP(user.phoneNumber, otp, 'verify_phone');
    if (reason === 'expired')
      return res.status(410).json({ success: false, message: 'OTP expired' });
    if (reason)
      return res.status(400).json({ success: false, message: 'Invalid OTP' });

    return res.json({ success: true, data: { message: 'Phone verified successfully' } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user._id);
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    return res.status(200).json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    return handleError(res, err);
  }
};
