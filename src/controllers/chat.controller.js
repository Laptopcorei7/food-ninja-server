const fs = require('fs');
const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Order = require('../models/Order');
const { getIO } = require('../socket');
const { handleError } = require('../utils/handleError');
const bot = require('../utils/supportBot');

const MAX_TEXT = 1000;
const ACTIVE = ['placed', 'accepted', 'preparing', 'on_the_way'];
const HAS_RIDER = ['on_the_way', 'delivered'];
const RIDER_REPLY_MS = 4000; // dev rider answers after about this long
const RIDER_REPLIES = ['On my way, see you soon!', 'Okay, noted.', 'I am close now.', 'Thank you!'];

// A message as the app shows it; "from" is relative to the chat's owner.
function messageView(m) {
  const o = typeof m.toObject === 'function' ? m.toObject() : m;
  return {
    _id: o._id,
    chatId: o.chatId,
    from: o.sender === 'user' ? 'me' : o.sender,
    ...(o.text && { text: o.text }),
    ...(o.imageUrl && { imageUrl: o.imageUrl }),
    ...(o.options?.length && { options: o.options }),
    ...(o.order?._id && { order: o.order }),
    createdAt: o.createdAt,
  };
}

// Messages already due (the dev rider's reply stays hidden until its time).
const visibleMessages = (chatId, after) =>
  Message.find({ chatId, createdAt: { $lte: new Date(), ...(after && { $gt: after }) } }).sort({ createdAt: 1, _id: 1 }).lean();

async function chatView(chat) {
  const c = chat.toObject();
  return {
    _id: c._id,
    kind: c.kind,
    ...(c.kind === 'support' ? { status: c.status } : { orderId: c.orderId, riderName: c.riderName }),
    messages: (await visibleMessages(c._id)).map(messageView),
  };
}

// Saves messages 1 ms apart (so they sort in order) with the last one at now, or
// delayMs from now, and moves the chat's preview.
async function addMessages(chat, list, delayMs = 0) {
  const base = Date.now() + delayMs - (list.length - 1);
  const saved = await Message.insertMany(list.map((m, i) => ({ chatId: chat._id, createdAt: new Date(base + i), ...m })));
  if (delayMs) return saved; // not shown yet, so no preview or event
  const last = list[list.length - 1];
  chat.lastMessage = last.text || 'Photo';
  chat.lastMessageTime = saved[saved.length - 1].createdAt;
  await chat.save();
  saved.forEach((m) => getIO()?.to(String(chat.userId)).emit('chat:message', messageView(m)));
  return saved;
}

// "Jollof and Kelewele", "Jollof, Waakye and Kelewele"
function itemsLabel(items) {
  const names = items.map((i) => i.name);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

async function latestActiveOrder(userId) {
  const order = await Order.findOne({ userId, status: { $in: ACTIVE } }).sort({ createdAt: -1 }).lean();
  if (!order) return null;
  const placedAt = order.statusHistory?.find((s) => s.status === 'placed')?.at ?? order.createdAt;
  return { _id: order._id, number: String(order._id).slice(-6).toUpperCase(), items: itemsLabel(order.items), placedAt };
}

// The immediate replies to what the user just sent: the bot's in support. In a rider
// chat outside production, the made-up rider's reply is stored a few seconds ahead
// and reaches the app by polling.
async function reply(chat, user, { option, photo }) {
  if (chat.kind === 'rider') {
    if (process.env.NODE_ENV !== 'production') {
      const count = await Message.countDocuments({ chatId: chat._id, sender: 'rider' });
      await addMessages(chat, [{ sender: 'rider', text: RIDER_REPLIES[count % RIDER_REPLIES.length] }], RIDER_REPLY_MS);
    }
    return [];
  }
  let answer;
  if (option) answer = bot.answer(option, option === '1' ? await latestActiveOrder(user._id) : null);
  else if (chat.status !== 'bot') return []; // a person will answer
  else if (photo) answer = { messages: [{ text: 'Thanks for the photo. A member of our team will look at it and reply here.' }], status: 'waiting_staff' };
  else answer = bot.answer(null);

  if (answer.status) chat.status = answer.status;
  return addMessages(chat, answer.messages.map((m) => ({ sender: 'bot', ...m })));
}

const findOwnChat = (req) =>
  mongoose.isValidObjectId(req.params.id) ? Chat.findOne({ _id: req.params.id, userId: req.user._id }) : null;

// Creates a chat once; when two first calls race, the unique index keeps one and
// the loser reads it back.
async function findOrCreate(filter, fields, firstMessages) {
  let chat = await Chat.findOne(filter);
  if (chat) return chat;
  try {
    chat = await Chat.create({ ...filter, ...fields });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return Chat.findOne(filter);
  }
  if (firstMessages.length) await addMessages(chat, firstMessages);
  return chat;
}

// GET /chats: the user's threads, newest first, without messages.
exports.listChats = async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user._id }).sort({ lastMessageTime: -1 }).lean();
    return res.json({ success: true, data: { chats } });
  } catch (err) {
    return handleError(res, err);
  }
};

// GET /chats/support: the user's support thread, started with the bot's greeting.
exports.getSupportChat = async (req, res) => {
  try {
    const chat = await findOrCreate(
      { userId: req.user._id, kind: 'support' },
      { status: 'bot' },
      bot.greeting(req.user.name).map((m) => ({ sender: 'bot', ...m }))
    );
    return res.json({ success: true, data: { chat: await chatView(chat) } });
  } catch (err) {
    return handleError(res, err);
  }
};

// GET /orders/:id/chat: the thread with this order's rider, once it has one.
exports.getOrderChat = async (req, res) => {
  try {
    const order = mongoose.isValidObjectId(req.params.id)
      ? await Order.findOne({ _id: req.params.id, userId: req.user._id }, 'status').lean()
      : null;
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let chat = await Chat.findOne({ orderId: order._id, kind: 'rider' });
    if (!chat) {
      if (!HAS_RIDER.includes(order.status))
        return res.status(409).json({ success: false, message: 'A rider has not picked up this order yet. You can message them once it is on its way.' });
      chat = await findOrCreate({ orderId: order._id, kind: 'rider' }, { userId: req.user._id, riderName: Order.DEMO_RIDER.name }, []);
    }
    return res.json({ success: true, data: { chat: await chatView(chat) } });
  } catch (err) {
    return handleError(res, err);
  }
};

// GET /chats/:id/messages?after=<ISO date>: messages newer than `after` (all without it).
exports.getMessages = async (req, res) => {
  try {
    let after = null;
    if (req.query.after != null) {
      after = new Date(req.query.after);
      if (Number.isNaN(after.getTime()))
        return res.status(400).json({ success: false, message: 'after must be an ISO date' });
    }
    const chat = await findOwnChat(req);
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    const messages = await visibleMessages(chat._id, after);
    return res.json({ success: true, data: { messages: messages.map(messageView) } });
  } catch (err) {
    return handleError(res, err);
  }
};

// The bot option a message stands for: a tapped option, or "1".."5" typed in support.
function optionFor(chat, { text, option }) {
  if (option != null) return option;
  const typed = text.trim();
  return chat.kind === 'support' && /^[1-5]$/.test(typed) ? typed : null;
}

// POST /chats/:id/messages { text?, option? }
exports.sendMessage = async (req, res) => {
  try {
    const { text, option } = req.body;
    if (option != null && (typeof option !== 'string' || !bot.OPTION_LABELS[option]))
      return res.status(400).json({ success: false, message: 'Unknown option' });
    if (option == null && (typeof text !== 'string' || !text.trim() || text.trim().length > MAX_TEXT))
      return res.status(400).json({ success: false, message: `text must be 1 to ${MAX_TEXT} characters` });

    const chat = await findOwnChat(req);
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    if (option != null && chat.kind !== 'support')
      return res.status(400).json({ success: false, message: 'Options are only for the support chat' });

    const chosen = optionFor(chat, { text, option });
    const [mine] = await addMessages(chat, [{ sender: 'user', text: option != null ? bot.OPTION_LABELS[option] : text.trim() }]);
    const replies = await reply(chat, req.user, { option: chosen });
    return res.status(201).json({ success: true, data: { messages: [mine, ...replies].map(messageView) } });
  } catch (err) {
    return handleError(res, err);
  }
};

const removeUpload = (file) =>
  file && fs.promises.unlink(file.path).catch((err) => console.error('Could not remove upload', file.path, err.message));

// POST /chats/:id/photo multipart "photo", optional "text" caption
exports.sendPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const caption = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (caption.length > MAX_TEXT) {
      await removeUpload(req.file);
      return res.status(400).json({ success: false, message: `text must be at most ${MAX_TEXT} characters` });
    }
    const chat = await findOwnChat(req);
    if (!chat) {
      await removeUpload(req.file);
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    const [mine] = await addMessages(chat, [{ sender: 'user', imageUrl: `/uploads/${req.file.filename}`, ...(caption && { text: caption }) }]);
    const replies = await reply(chat, req.user, { photo: true });
    return res.status(201).json({ success: true, data: { messages: [mine, ...replies].map(messageView) } });
  } catch (err) {
    await removeUpload(req.file);
    return handleError(res, err);
  }
};
