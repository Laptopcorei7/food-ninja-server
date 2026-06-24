const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  contact: { type: String, required: true },
  code: { type: String, required: true },
  purpose: { type: String, enum: ['verify_phone', 'forgot_password'], required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
}, { timestamps: true });

// MongoDB TTL index auto-deletes expired OTP documents
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTP', otpSchema);
