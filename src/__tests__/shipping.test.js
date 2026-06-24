const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Order = require('../models/Order');

const BASE = '/api/v1/shipping';

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

async function createOrder(userId, overrides = {}) {
  const restaurant = await Restaurant.create({ name: 'Burger Place' });
  return Order.create({
    userId,
    restaurantId: restaurant._id,
    items: [{ menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 }],
    subTotal: 12,
    deliveryCharge: 10,
    total: 22,
    deliveryAddress: { address: '123 Main St', latitude: 5.6037, longitude: -0.187 },
    ...overrides,
  });
}

// ─── GET /shipping/:orderId ────────────────────────────────────────────────

describe('GET /shipping/:orderId', () => {
  it('returns delivery address and order location (200)', async () => {
    const user = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app)
      .get(`${BASE}/${order._id}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('deliveryAddress');
    expect(res.body.data.deliveryAddress.address).toBe('123 Main St');
  });

  it('returns 404 for another user\'s order', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const order = await createOrder(other._id);

    const res = await request(app)
      .get(`${BASE}/${order._id}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 without a token', async () => {
    const user = await createUser();
    const order = await createOrder(user._id);
    const res = await request(app).get(`${BASE}/${order._id}`);
    expect(res.status).toBe(401);
  });
});

// ─── PUT /shipping/:orderId ────────────────────────────────────────────────

describe('PUT /shipping/:orderId', () => {
  it('updates the delivery address (200)', async () => {
    const user = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app)
      .put(`${BASE}/${order._id}`)
      .set('Authorization', authHeader(user._id))
      .send({ deliverTo: { address: '456 New St', latitude: 5.0, longitude: -0.2 } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deliveryAddress.address).toBe('456 New St');
  });

  it('returns 400 when deliverTo is missing', async () => {
    const user = await createUser();
    const order = await createOrder(user._id);

    const res = await request(app)
      .put(`${BASE}/${order._id}`)
      .set('Authorization', authHeader(user._id))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('deliverTo is required');
  });

  it('returns 404 for another user\'s order', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const order = await createOrder(other._id);

    const res = await request(app)
      .put(`${BASE}/${order._id}`)
      .set('Authorization', authHeader(user._id))
      .send({ deliverTo: { address: '456 New St', latitude: 5.0, longitude: -0.2 } });

    expect(res.status).toBe(404);
  });
});
