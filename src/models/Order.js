const mongoose = require('mongoose');

const STATUS_STEPS = ['placed', 'accepted', 'preparing', 'on_the_way', 'delivered'];

const orderItemSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
  name: String,
  photoUrl: String,
  restaurantName: String,
  qty: { type: Number, default: 1 },
  price: Number, // dish price plus the option's extraPrice
  optionId: mongoose.Schema.Types.ObjectId,
  optionName: String,
});

const locationSchema = new mongoose.Schema({
  address: String,
  latitude: Number,
  longitude: Number,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  items: [orderItemSchema],
  // pending = in the cart. Placed orders move along STATUS_STEPS, or to cancelled.
  status: {
    type: String,
    enum: ['pending', ...STATUS_STEPS, 'cancelled'],
    default: 'pending',
  },
  statusHistory: [{ status: String, at: Date, _id: false }], // one entry per status after pending
  estimatedMinutes: Number, // set when placed: restaurant prep time plus travel
  paymentType: { type: String, enum: ['card', 'momo', 'cash', 'paypal', 'visa', 'payoneer'] },
  paymentStatus: { type: String, enum: ['pending', 'cash', 'refunded'] }, // no real charge until Paystack
  cancelReason: String,
  cancelNote: String,
  reviewed: { type: Boolean, default: false }, // set once by POST /orders/:id/review
  subTotal: { type: Number, default: 0 },
  deliveryCharge: { type: Number, default: 10 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  deliveryAddress: locationSchema,
  orderLocation: locationSchema,
  paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' },
  voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher' },
  driverId: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
module.exports.STATUS_STEPS = STATUS_STEPS;
