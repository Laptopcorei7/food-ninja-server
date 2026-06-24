const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');

const BASE = '/api/v1/payments';

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

async function createPayment(userId, overrides = {}) {
  return PaymentMethod.create({
    userId,
    type: 'visa',
    details: 'Visa **** 1234',
    maskedNumber: '**** **** **** 1234',
    ...overrides,
  });
}

// ─── GET /payments ─────────────────────────────────────────────────────────

describe('GET /payments', () => {
  it('returns an empty list when user has no payment methods (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('returns only the current user\'s payment methods (200)', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });

    await createPayment(user._id);
    await createPayment(other._id);

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});

// ─── POST /payments ────────────────────────────────────────────────────────

describe('POST /payments', () => {
  it('creates a payment method and returns it (201)', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(user._id))
      .send({ type: 'visa', details: 'Visa **** 1234', maskedNumber: '**** **** **** 1234' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('visa');
    expect(res.body.data.userId).toBe(user._id.toString());
  });

  it('adds the payment ID to the user\'s paymentMethods array', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(user._id))
      .send({ type: 'visa', details: 'Visa **** 1234' });

    expect(res.status).toBe(201);
    const updated = await User.findById(user._id);
    expect(updated.paymentMethods).toHaveLength(1);
    expect(updated.paymentMethods[0].toString()).toBe(res.body.data._id);
  });

  it('returns 400 when type is missing', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(user._id))
      .send({ details: 'Visa **** 1234' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when details is missing', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(user._id))
      .send({ type: 'visa' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post(BASE)
      .send({ type: 'card', details: 'Visa **** 1234' });

    expect(res.status).toBe(401);
  });
});

// ─── PUT /payments/:id/default ─────────────────────────────────────────────

describe('PUT /payments/:id/default', () => {
  it('sets the default payment method (200)', async () => {
    const user = await createUser();
    const payment = await createPayment(user._id);

    const res = await request(app)
      .put(`${BASE}/${payment._id}/default`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await User.findById(user._id);
    expect(updated.defaultPaymentMethod.toString()).toBe(payment._id.toString());
  });

  it('returns 404 for another user\'s payment method', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const payment = await createPayment(other._id);

    const res = await request(app)
      .put(`${BASE}/${payment._id}/default`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── DELETE /payments/:id ──────────────────────────────────────────────────

describe('DELETE /payments/:id', () => {
  it('removes the payment method (200)', async () => {
    const user = await createUser();
    const payment = await createPayment(user._id);

    const res = await request(app)
      .delete(`${BASE}/${payment._id}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const deleted = await PaymentMethod.findById(payment._id);
    expect(deleted).toBeNull();
  });

  it('clears defaultPaymentMethod when that payment is removed', async () => {
    const user = await createUser();
    const payment = await createPayment(user._id);
    await User.findByIdAndUpdate(user._id, { defaultPaymentMethod: payment._id });

    await request(app)
      .delete(`${BASE}/${payment._id}`)
      .set('Authorization', authHeader(user._id));

    const updated = await User.findById(user._id);
    expect(updated.defaultPaymentMethod).toBeUndefined();
  });

  it('returns 404 for another user\'s payment method', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const payment = await createPayment(other._id);

    const res = await request(app)
      .delete(`${BASE}/${payment._id}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(404);
  });
});
