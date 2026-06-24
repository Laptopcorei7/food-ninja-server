const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: String,
  userPhotoUrl: String,
  date: { type: Date, default: Date.now },
  stars: Number,
  comment: String,
}, { _id: false });

const menuItemSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  photoUrl: String,
  rating: { type: Number, default: 0 },
  orderCount: { type: Number, default: 0 },
  ingredients: [String],
  description: String,
  tags: [String],
  testimonials: [testimonialSchema],
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);
