const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  photoUrl: String,
  photoCredit: { name: String, url: String }, // photographer and photo page, for the credits list
  code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  discountAmount: { type: Number, required: true }, // flat GHS, once per checkout, once per user
  minSubTotal: { type: Number, default: 0 }, // counted over the orders the voucher applies to
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }, // set = that restaurant only
  expiresAt: Date,
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Voucher', voucherSchema);
