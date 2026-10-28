const mongoose = require('mongoose');
const CATEGORIES = require('../utils/categories');

const testimonialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: String,
  userPhotoUrl: String,
  date: { type: Date, default: Date.now },
  stars: Number,
  comment: String,
}, { _id: false });

// A portion size. The first option is the default; its extraPrice is usually 0.
const optionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  extraPrice: { type: Number, default: 0, min: 0 }, // GHS on top of price
});

const menuItemSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, enum: CATEGORIES },
  photoUrl: String,
  photoCredit: { name: String, url: String }, // photographer and photo page, for the credits list
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 }, // reviews behind rating; 0 means rating is seed data
  orderCount: { type: Number, default: 0 },
  ingredients: [String],
  description: String,
  tags: [String],
  options: [optionSchema],
  testimonials: [testimonialSchema],
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);
