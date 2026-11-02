const mongoose = require('mongoose');

// One support thread per user, and one rider thread per order. Staff answer in
// the same support thread later (status moves from bot to waiting_staff to staff).
const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['support', 'rider'], required: true },
  status: { type: String, enum: ['bot', 'waiting_staff', 'staff'] }, // support only
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // rider only
  riderName: String, // rider only
  lastMessage: String,
  lastMessageTime: Date,
}, { timestamps: true });

chatSchema.index({ userId: 1, kind: 1 }, { unique: true, partialFilterExpression: { kind: 'support' } });
chatSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { kind: 'rider' } });

module.exports = mongoose.model('Chat', chatSchema);
