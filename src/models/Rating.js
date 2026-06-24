const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  targetType: { type: String, enum: ['driver', 'food', 'restaurant'], required: true },
  stars: { type: Number, min: 1, max: 5, required: true },
  feedback: String,
}, { timestamps: true });

module.exports = mongoose.model('Rating', ratingSchema);
