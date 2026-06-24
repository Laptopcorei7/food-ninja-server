const Chat = require("../models/Chat");
const Message = require("../models/Message");
const { getIO } = require("../socket");

exports.listChats = async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id }).sort({
      lastMessageTime: -1,
    });
    return res.json({ success: true, data: chats, total: chats.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });

    const messages = await Message.find({ chatId: req.params.id }).sort({
      timestamp: 1,
    });
    return res.json({ success: true, data: messages, total: messages.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text)
      return res
        .status(400)
        .json({ success: false, message: "text is required" });

    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });

    const message = await Message.create({
      chatId: chat._id,
      senderId: req.user._id,
      text,
    });

    chat.lastMessage = text;
    chat.lastMessageTime = new Date();
    await chat.save();

    getIO()
      ?.to(String(chat._id))
      .emit("chat:message", { chatId: chat._id, message });

    return res.status(201).json({ success: true, data: message });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
