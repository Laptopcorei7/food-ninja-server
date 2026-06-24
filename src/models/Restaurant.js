const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  photoUrl: String,
  distance: Number,
  rating: { type: Number, default: 0 },
  description: String,
  tags: [String],
  popularMenu: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
}, { timestamps: true });

module.exports = mongoose.model('Restaurant', restaurantSchema);
