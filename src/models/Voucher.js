const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  photoUrl: String,
  discountAmount: { type: Number, required: true },
  expiresAt: Date,
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Voucher', voucherSchema);
