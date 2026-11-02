const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender: { type: String, enum: ['user', 'bot', 'staff', 'rider'], required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who answered, for staff messages
  text: String,
  imageUrl: String,
  options: [{ label: String, value: String, _id: false }], // bot buttons
  order: { // order card in a bot reply
    _id: mongoose.Schema.Types.ObjectId,
    number: String,
    items: String,
    placedAt: Date,
  },
  // Set by hand for the dev rider's delayed reply, which stays hidden until then
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ chatId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
