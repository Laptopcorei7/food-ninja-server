const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { generateToken } = require('../utils/generateToken');
const { generateOTP } = require('../utils/generateOTP');
const { sendOTP } = require('../utils/sendOTP');

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
    return res.status(500).json({ success: false, message: err.message });
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
    return res.status(500).json({ success: false, message: err.message });
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
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { phoneNumber, code, purpose } = req.body;
    if (!phoneNumber || !code || !purpose)
      return res.status(400).json({ success: false, message: 'phoneNumber, code, and purpose are required' });

    const otp = await OTP.findOne({ contact: phoneNumber, code, purpose, used: false });
    if (!otp)
      return res.status(400).json({ success: false, message: 'Invalid OTP' });

    if (otp.expiresAt < new Date())
      return res.status(400).json({ success: false, message: 'OTP expired' });

    otp.used = true;
    await otp.save();

    return res.status(200).json({ success: true, data: { message: 'OTP verified' } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
    return res.status(500).json({ success: false, message: err.message });
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
    const otp = await OTP.findOne({
      contact: { $in: [contact, contact.toLowerCase()] },
      code,
      purpose: 'forgot_password',
      used: false,
    });
    if (!otp)
      return res.status(400).json({ success: false, message: 'Invalid code' });

    if (otp.expiresAt < new Date())
      return res.status(400).json({ success: false, message: 'Code expired' });

    const user = await User.findOne({ $or: [{ email: otp.contact }, { phoneNumber: otp.contact }] });
    if (!user)
      return res.status(400).json({ success: false, message: 'Invalid code' });

    otp.used = true;
    await otp.save();

    const resetToken = jwt.sign({ id: user._id }, resetSecret(user), { expiresIn: '10m' });
    return res.status(200).json({ success: true, data: { resetToken } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Protected OTP send — saves phone to user profile, sends OTP via SMS
exports.otpSend = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone)
      return res.status(400).json({ success: false, message: 'phone is required' });

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 90 * 1000);

    await OTP.deleteMany({ contact: phone, purpose: 'verify_phone', used: false });
    await OTP.create({ contact: phone, code, purpose: 'verify_phone', expiresAt, used: false });
    await User.findByIdAndUpdate(req.user._id, { phoneNumber: phone });

    await sendOTP(phone, code, 'sms');

    return res.json({ success: true, message: 'OTP sent to your phone' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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

    const record = await OTP.findOne({
      contact: user.phoneNumber,
      code: otp,
      purpose: 'verify_phone',
      used: false,
    });

    if (!record)
      return res.status(400).json({ success: false, message: 'Invalid OTP' });

    if (record.expiresAt < new Date())
      return res.status(410).json({ success: false, message: 'OTP expired' });

    record.used = true;
    await record.save();

    return res.json({ success: true, message: 'Phone verified successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user._id);
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    return res.status(200).json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
