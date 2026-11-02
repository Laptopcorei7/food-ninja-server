const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const Message = require('../models/Message');

const BASE = '/api/v1/chats';
const UPLOADS = path.join(__dirname, '..', '..', 'uploads');

// ─── Helpers ───────────────────────────────────────────────────────────────

async function createUser(overrides = {}) {
  const hashed = await bcrypt.hash('password123', 10);
  return User.create({ name: 'Ama Mensah', email: 'test@example.com', password: hashed, ...overrides });
}

function authHeader(userId) {
  return `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`;
}

function createOrder(userId, status = 'placed') {
  return Order.create({
    userId,
    restaurantId: new mongoose.Types.ObjectId(),
    items: [{ name: 'Jollof', qty: 1, price: 40 }, { name: 'Kelewele', qty: 2, price: 15 }],
    status,
    statusHistory: [{ status: 'placed', at: new Date() }],
  });
}

async function supportChat(auth) {
  const res = await request(app).get(`${BASE}/support`).set('Authorization', auth);
  return res.body.data.chat;
}

const send = (auth, chatId, body) => request(app).post(`${BASE}/${chatId}/messages`).set('Authorization', auth).send(body);
const values = (msg) => msg.options.map((o) => o.value);

// ─── Support chat ──────────────────────────────────────────────────────────

describe('GET /chats/support', () => {
  it('starts one thread per user with the bot greeting and the five-item menu', async () => {
    const user = await createUser();
    const auth = authHeader(user._id);
    const chat = await supportChat(auth);
    expect(chat).toMatchObject({ kind: 'support', status: 'bot' });
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toMatchObject({ from: 'bot', chatId: chat._id });
    expect(chat.messages[0].text).toMatch(/^Hi Ama!/);
    expect(chat.messages[0].options.map((o) => o.label)).toEqual(
      ['Order management', 'Payments', 'Account and profile', 'Order tracking', 'Safety']
    );

    const again = await supportChat(auth);
    expect(again._id).toBe(chat._id);
    expect(again.messages).toHaveLength(1);

    const list = await request(app).get(BASE).set('Authorization', auth);
    expect(list.body.data.chats).toHaveLength(1);
  });
});

describe('POST /chats/:id/messages (support bot)', () => {
  let auth;
  let chat;
  let user;
  beforeEach(async () => {
    user = await createUser();
    auth = authHeader(user._id);
    chat = await supportChat(auth);
  });

  it('treats a typed "2" like the Payments option', async () => {
    const res = await send(auth, chat._id, { text: ' 2 ' });
    expect(res.status).toBe(201);
    const [mine, botReply] = res.body.data.messages;
    expect(mine).toMatchObject({ from: 'me', text: '2' });
    expect(botReply.from).toBe('bot');
    expect(botReply.text).toMatch(/MoMo/);
    expect(values(botReply)).toEqual(['talk_to_person', 'menu']);
  });

  it('shows the latest active order as a card for Order management', async () => {
    await createOrder(user._id, 'delivered');
    const order = await createOrder(user._id, 'preparing');
    const res = await send(auth, chat._id, { option: '1' });
    const [mine, botReply] = res.body.data.messages;
    expect(mine).toMatchObject({ from: 'me', text: 'Order management' });
    expect(botReply.order).toMatchObject({
      _id: String(order._id),
      number: String(order._id).slice(-6).toUpperCase(),
      items: 'Jollof and Kelewele',
    });
    expect(values(botReply)).toEqual(['order_issues', 'order_not_received', 'menu']);
  });

  it('says so when there is no active order', async () => {
    const res = await send(auth, chat._id, { option: '1' });
    expect(res.body.data.messages[1].text).toMatch(/no active orders/);
    expect(res.body.data.messages[1].order).toBeUndefined();
  });

  it('hands over to a person, after which the bot stays quiet on free text', async () => {
    const res = await send(auth, chat._id, { option: 'talk_to_person' });
    expect(res.body.data.messages[1].text).toBe('A member of our team will reply here soon.');
    const after = await supportChat(auth);
    expect(after.status).toBe('waiting_staff');

    const quiet = await send(auth, chat._id, { text: 'My food was cold' });
    expect(quiet.body.data.messages).toHaveLength(1);
    expect(quiet.body.data.messages[0].from).toBe('me');
  });

  it('re-sends the menu on text it does not understand', async () => {
    const res = await send(auth, chat._id, { text: 'hello?' });
    expect(res.body.data.messages[1].text).toMatch(/didn't catch that/);
    expect(res.body.data.messages[1].options).toHaveLength(5);
  });

  it('checks text, option and ownership', async () => {
    expect((await send(auth, chat._id, {})).status).toBe(400);
    expect((await send(auth, chat._id, { text: '   ' })).status).toBe(400);
    expect((await send(auth, chat._id, { text: 'x'.repeat(1001) })).status).toBe(400);
    expect((await send(auth, chat._id, { option: 'nope' })).status).toBe(400);
    const other = await createUser({ email: 'other@example.com' });
    expect((await send(authHeader(other._id), chat._id, { text: 'hi' })).status).toBe(404);
  });
});

describe('GET /chats/:id/messages', () => {
  it('returns only messages newer than ?after', async () => {
    const user = await createUser();
    const auth = authHeader(user._id);
    const chat = await supportChat(auth);
    const greetingAt = chat.messages[0].createdAt;
    await new Promise((r) => setTimeout(r, 5));
    await send(auth, chat._id, { text: '3' });

    const all = await request(app).get(`${BASE}/${chat._id}/messages`).set('Authorization', auth);
    expect(all.body.data.messages).toHaveLength(3);
    const newer = await request(app).get(`${BASE}/${chat._id}/messages`).query({ after: greetingAt }).set('Authorization', auth);
    expect(newer.body.data.messages.map((m) => m.from)).toEqual(['me', 'bot']);

    const bad = await request(app).get(`${BASE}/${chat._id}/messages`).query({ after: 'yesterday' }).set('Authorization', auth);
    expect(bad.status).toBe(400);
  });
});

// ─── Rider chat ────────────────────────────────────────────────────────────

describe('rider chat', () => {
  const orderChat = (auth, order) => request(app).get(`/api/v1/orders/${order._id}/chat`).set('Authorization', auth);

  it('is refused (409) until the order is on its way, and 404 for another user\'s order', async () => {
    const user = await createUser();
    const order = await createOrder(user._id, 'preparing');
    const res = await orderChat(authHeader(user._id), order);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/on its way/);
    const other = await createUser({ email: 'other@example.com' });
    expect((await orderChat(authHeader(other._id), order)).status).toBe(404);
  });

  it('opens once the rider has the order, and the dev rider answers a few seconds later', async () => {
    const user = await createUser();
    const auth = authHeader(user._id);
    const order = await createOrder(user._id, 'on_the_way');
    const res = await orderChat(auth, order);
    expect(res.status).toBe(200);
    const { chat } = res.body.data;
    expect(chat).toMatchObject({ kind: 'rider', orderId: String(order._id), riderName: Order.DEMO_RIDER.name, messages: [] });

    const sent = await send(auth, chat._id, { text: 'Please call when you arrive' });
    expect(sent.body.data.messages).toHaveLength(1);
    const poll = () => request(app).get(`${BASE}/${chat._id}/messages`).set('Authorization', auth);
    expect((await poll()).body.data.messages).toHaveLength(1); // reply not due yet

    // stand in for the 4 s wait: make the reply due now, still after my message
    const mineAt = new Date(sent.body.data.messages[0].createdAt);
    await Message.updateOne({ chatId: chat._id, sender: 'rider' }, { createdAt: new Date(mineAt.getTime() + 1) });
    const later = (await poll()).body.data.messages;
    expect(later.map((m) => m.from)).toEqual(['me', 'rider']);
    expect(later[1].text).toBe('On my way, see you soon!');

    expect((await send(auth, chat._id, { option: '1' })).status).toBe(400); // no bot here
    expect((await orderChat(auth, order)).body.data.chat._id).toBe(chat._id);
  });
});

// ─── Photos ────────────────────────────────────────────────────────────────

describe('POST /chats/:id/photo', () => {
  const photo = (auth, chatId) => request(app).post(`${BASE}/${chatId}/photo`).set('Authorization', auth);
  const uploadCount = () => fs.readdirSync(UPLOADS).length;

  it('saves the photo with its caption and passes the thread to a person', async () => {
    const user = await createUser();
    const auth = authHeader(user._id);
    const chat = await supportChat(auth);
    const res = await photo(auth, chat._id).field('text', 'Wrong dish').attach('photo', Buffer.from('fake'), { filename: 'dish.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    const [mine, botReply] = res.body.data.messages;
    expect(mine).toMatchObject({ from: 'me', text: 'Wrong dish' });
    expect(mine.imageUrl).toMatch(/^\/uploads\/[^/]+\.jpg$/);
    await fs.promises.unlink(path.join(UPLOADS, path.basename(mine.imageUrl)));
    expect(botReply.text).toMatch(/photo/);
    expect((await supportChat(auth)).status).toBe('waiting_staff');
  });

  it('refuses a missing file, a non-image and another user\'s chat without keeping the file', async () => {
    const user = await createUser();
    const chat = await supportChat(authHeader(user._id));
    const other = await createUser({ email: 'other@example.com' });
    const before = uploadCount();

    expect((await photo(authHeader(user._id), chat._id)).status).toBe(400);
    const txt = await photo(authHeader(user._id), chat._id).attach('photo', Buffer.from('hi'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(txt.status).toBe(400);
    const notMine = await photo(authHeader(other._id), chat._id).attach('photo', Buffer.from('fake'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(notMine.status).toBe(404);
    expect(uploadCount()).toBe(before);
  });
});

// ─── Help ──────────────────────────────────────────────────────────────────

describe('GET /help', () => {
  it('returns FAQs in three categories and the contact details', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/v1/help').set('Authorization', authHeader(user._id));
    expect(res.status).toBe(200);
    const { faqs, contact } = res.body.data;
    for (const category of ['general', 'account', 'services'])
      expect(faqs.filter((f) => f.category === category)).toHaveLength(5);
    expect(new Set(faqs.map((f) => f._id)).size).toBe(faqs.length);
    expect(Object.keys(contact).sort()).toEqual(['email', 'facebook', 'instagram', 'phone', 'website', 'whatsapp']);
  });

  it('needs a login', async () => {
    expect((await request(app).get('/api/v1/help')).status).toBe(401);
  });
});
