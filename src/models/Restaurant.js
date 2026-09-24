const mongoose = require('mongoose');
const CATEGORIES = require('../utils/categories');

// GeoJSON Point: coordinates are [longitude, latitude].
const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true },
  coordinates: { type: [Number], required: true },
}, { _id: false });

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  photoUrl: String,
  photoCredit: { name: String, url: String }, // photographer and photo page, for the credits list
  location: pointSchema,
  address: String,
  deliveryTimeMins: Number,
  rating: { type: Number, default: 0 },
  description: String,
  categories: [{ type: String, enum: CATEGORIES }],
  tags: [String],
  popularMenu: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
}, { timestamps: true });

restaurantSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Restaurant', restaurantSchema);
