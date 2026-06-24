const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Notification = require('../models/Notification');

const BASE = '/api/v1/notifications';

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

async function createNotification(userId, overrides = {}) {
  return Notification.create({
    userId,
    type: 'order_taken',
    message: 'Your order has been taken',
    read: false,
    ...overrides,
  });
}

// ─── GET /notifications ────────────────────────────────────────────────────

describe('GET /notifications', () => {
  it('returns the current user\'s notifications sorted newest first (200)', async () => {
    const user = await createUser();
    await createNotification(user._id, { message: 'First', timestamp: new Date('2026-01-01') });
    await createNotification(user._id, { message: 'Second', timestamp: new Date('2026-01-02') });

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.data[0].message).toBe('Second');
  });

  it('does not return other users\' notifications', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    await createNotification(other._id);

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns an empty list when there are no notifications (200)', async () => {
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

// ─── PUT /notifications/:id/read ───────────────────────────────────────────

describe('PUT /notifications/:id/read', () => {
  it('marks a notification as read (200)', async () => {
    const user = await createUser();
    const notification = await createNotification(user._id, { read: false });

    const res = await request(app)
      .put(`${BASE}/${notification._id}/read`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.read).toBe(true);
  });

  it('returns 404 for another user\'s notification', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const notification = await createNotification(other._id);

    const res = await request(app)
      .put(`${BASE}/${notification._id}/read`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 without a token', async () => {
    const user = await createUser();
    const notification = await createNotification(user._id);

    const res = await request(app).put(`${BASE}/${notification._id}/read`);
    expect(res.status).toBe(401);
  });
});
