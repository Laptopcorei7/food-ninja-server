const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  phoneNumber: String,
  photoUrl: String,
  location: {
    address: String,
    latitude: Number,
    longitude: Number,
  },
  membershipTier: { type: String, default: 'Member Gold' },
  voucherCount: { type: Number, default: 0 },
  paymentMethods: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' }],
  defaultPaymentMethod: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' },
}, { timestamps: true });

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
