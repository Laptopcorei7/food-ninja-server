const bcrypt = require('bcrypt');
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
    const { method, contact } = req.body;
    if (!method || !contact)
      return res.status(400).json({ success: false, message: 'method and contact are required' });

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 90 * 1000);

    await OTP.findOneAndDelete({ contact, purpose: 'forgot_password', used: false });
    await OTP.create({ contact, code, purpose: 'forgot_password', expiresAt, used: false });

    await sendOTP(contact, code, method);

    return res.status(200).json({ success: true, data: { message: 'Reset code sent' } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { contact, code, newPassword, confirmPassword } = req.body;
    if (!contact || !code || !newPassword || !confirmPassword)
      return res.status(400).json({
        success: false,
        message: 'contact, code, newPassword, and confirmPassword are required',
      });

    if (newPassword !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });

    const otp = await OTP.findOne({ contact, code, purpose: 'forgot_password', used: false });
    if (!otp)
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });

    if (otp.expiresAt < new Date())
      return res.status(400).json({ success: false, message: 'Code expired' });

    const user = await User.findOne({ $or: [{ email: contact }, { phoneNumber: contact }] });
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    otp.used = true;
    await otp.save();

    return res.status(200).json({ success: true, data: { message: 'Password reset successful' } });
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
