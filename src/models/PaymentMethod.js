const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['paypal', 'visa', 'payoneer', 'card'], required: true },
  maskedNumber: String,
  details: String,
  last4: String,
  brand: String,
}, { timestamps: true });

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
