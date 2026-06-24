const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

const BASE = '/api/v1/chats';

// ─── Helpers ───────────────────────────────────────────────────────────────

async function createUser(overrides = {}) {
  const hashed = await bcrypt.hash('password123', 10);
  return User.create({
    name: 'Test User',
    email: 'test@example.com',
    password: hashed,
    ...overrides,
  });
}

function authHeader(userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  return `Bearer ${token}`;
}

async function createChat(participantIds, overrides = {}) {
  return Chat.create({ participants: participantIds, ...overrides });
}

// ─── GET /chats ────────────────────────────────────────────────────────────

describe('GET /chats', () => {
  it('returns chats the user participates in (200)', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    await createChat([user._id, other._id]);

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('does not return chats the user is not part of', async () => {
    const user = await createUser();
    const a = await createUser({ email: 'a@example.com' });
    const b = await createUser({ email: 'b@example.com' });
    await createChat([a._id, b._id]);

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns an empty list when user has no chats (200)', async () => {
    const user = await createUser();

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});

// ─── GET /chats/:id/messages ───────────────────────────────────────────────

describe('GET /chats/:id/messages', () => {
  it('returns all messages in a chat (200)', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const chat = await createChat([user._id, other._id]);
    await Message.create({ chatId: chat._id, senderId: user._id, text: 'Hello' });
    await Message.create({ chatId: chat._id, senderId: other._id, text: 'Hi there' });

    const res = await request(app)
      .get(`${BASE}/${chat._id}/messages`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('returns 404 when the user is not a participant', async () => {
    const user = await createUser();
    const a = await createUser({ email: 'a@example.com' });
    const b = await createUser({ email: 'b@example.com' });
    const chat = await createChat([a._id, b._id]);

    const res = await request(app)
      .get(`${BASE}/${chat._id}/messages`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns an empty list for a chat with no messages', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const chat = await createChat([user._id, other._id]);

    const res = await request(app)
      .get(`${BASE}/${chat._id}/messages`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

// ─── POST /chats/:id/messages ──────────────────────────────────────────────

describe('POST /chats/:id/messages', () => {
  it('sends a message and returns it (201)', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const chat = await createChat([user._id, other._id]);

    const res = await request(app)
      .post(`${BASE}/${chat._id}/messages`)
      .set('Authorization', authHeader(user._id))
      .send({ text: 'Hello!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.text).toBe('Hello!');
    expect(res.body.data.senderId).toBe(user._id.toString());
  });

  it('updates lastMessage on the chat after sending', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const chat = await createChat([user._id, other._id]);

    await request(app)
      .post(`${BASE}/${chat._id}/messages`)
      .set('Authorization', authHeader(user._id))
      .send({ text: 'Latest message' });

    const updated = await Chat.findById(chat._id);
    expect(updated.lastMessage).toBe('Latest message');
    expect(updated.lastMessageTime).toBeDefined();
  });

  it('returns 400 when text is missing', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const chat = await createChat([user._id, other._id]);

    const res = await request(app)
      .post(`${BASE}/${chat._id}/messages`)
      .set('Authorization', authHeader(user._id))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('text is required');
  });

  it('returns 404 when the user is not a participant', async () => {
    const user = await createUser();
    const a = await createUser({ email: 'a@example.com' });
    const b = await createUser({ email: 'b@example.com' });
    const chat = await createChat([a._id, b._id]);

    const res = await request(app)
      .post(`${BASE}/${chat._id}/messages`)
      .set('Authorization', authHeader(user._id))
      .send({ text: 'Hello!' });

    expect(res.status).toBe(404);
  });

  it('returns 401 without a token', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const chat = await createChat([user._id, other._id]);

    const res = await request(app)
      .post(`${BASE}/${chat._id}/messages`)
      .send({ text: 'Hello!' });

    expect(res.status).toBe(401);
  });
});
