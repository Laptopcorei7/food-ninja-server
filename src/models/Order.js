const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
  name: String,
  photoUrl: String,
  restaurantName: String,
  qty: { type: Number, default: 1 },
  price: Number,
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
  status: {
    type: String,
    enum: ['pending', 'processing', 'delivered', 'cancelled'],
    default: 'pending',
  },
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
