const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // The app adds card and momo. Cash on delivery has no record (POST /cart/place paymentType "cash").
  type: { type: String, enum: ['paypal', 'visa', 'payoneer', 'card', 'momo'], required: true },
  maskedNumber: String,
  details: String,
  last4: String, // never the full card or MoMo number, never a CVV
  brand: String, // card: visa | mastercard
  network: String, // momo: mtn | telecel | airteltigo
}, { timestamps: true });

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
