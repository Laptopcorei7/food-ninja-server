const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');

const BASE = '/api/v1/users';

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

// ─── GET /users/me ─────────────────────────────────────────────────────────

describe('GET /users/me', () => {
  it('returns the current user wrapped in data.user (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe('test@example.com');
  });

  it('maps phoneNumber → phone and photoUrl → photo in the response', async () => {
    const user = await createUser({ phoneNumber: '+233501234567', photoUrl: 'http://x/photo.jpg' });
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', authHeader(user._id));

    expect(res.body.data.user.phone).toBe('+233501234567');
    expect(res.body.data.user.photo).toBe('http://x/photo.jpg');
    expect(res.body.data.user.phoneNumber).toBeUndefined();
    expect(res.body.data.user.photoUrl).toBeUndefined();
  });

  it('maps location.latitude/longitude → lat/lng', async () => {
    const user = await createUser({
      location: { address: '123 Main St', latitude: 5.6037, longitude: -0.187 },
    });
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', authHeader(user._id));

    expect(res.body.data.user.location.lat).toBe(5.6037);
    expect(res.body.data.user.location.lng).toBe(-0.187);
    expect(res.body.data.user.location.latitude).toBeUndefined();
  });

  it('does not include password in response', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', authHeader(user._id));

    expect(res.body.data.user.password).toBeUndefined();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(`${BASE}/me`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Unauthorized');
  });
});

// ─── PATCH /users/me/profile ───────────────────────────────────────────────

describe('PATCH /users/me/profile', () => {
  it('updates profile fields and returns updated user (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .patch(`${BASE}/me/profile`)
      .set('Authorization', authHeader(user._id))
      .send({ firstName: 'John', lastName: 'Doe', phone: '+233501234567' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.firstName).toBe('John');
    expect(res.body.data.user.lastName).toBe('Doe');
    expect(res.body.data.user.phone).toBe('+233501234567');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .patch(`${BASE}/me/profile`)
      .send({ firstName: 'John' });
    expect(res.status).toBe(401);
  });
});

// ─── POST /users/me/photo ──────────────────────────────────────────────────

describe('POST /users/me/photo', () => {
  it('returns 400 when no file is attached', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/me/photo`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No file uploaded');
  });

  it('uploads a photo and returns a photoUrl (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/me/photo`)
      .set('Authorization', authHeader(user._id))
      .attach('photo', Buffer.from('fake-image-data'), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.photoUrl).toMatch(/\/uploads\//);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post(`${BASE}/me/photo`);
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /users/me/location ──────────────────────────────────────────────

describe('PATCH /users/me/location', () => {
  it('updates location and returns updated user (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .patch(`${BASE}/me/location`)
      .set('Authorization', authHeader(user._id))
      .send({ address: '123 Main St', lat: 5.6037, lng: -0.187 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.location.lat).toBe(5.6037);
    expect(res.body.data.user.location.lng).toBe(-0.187);
    expect(res.body.data.user.location.address).toBe('123 Main St');
  });

  it('returns 400 when address is missing', async () => {
    const user = await createUser();
    const res = await request(app)
      .patch(`${BASE}/me/location`)
      .set('Authorization', authHeader(user._id))
      .send({ lat: 5.6037, lng: -0.187 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when lat is missing', async () => {
    const user = await createUser();
    const res = await request(app)
      .patch(`${BASE}/me/location`)
      .set('Authorization', authHeader(user._id))
      .send({ address: '123 Main St', lng: -0.187 });

    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .patch(`${BASE}/me/location`)
      .send({ address: '123 Main St', lat: 5.6037, lng: -0.187 });

    expect(res.status).toBe(401);
  });
});

// ─── GET /users/me/payment-methods ────────────────────────────────────────

describe('GET /users/me/payment-methods', () => {
  it('returns the user\'s payment methods (200)', async () => {
    const user = await createUser();
    await PaymentMethod.create({ userId: user._id, type: 'card', last4: '4242', brand: 'Visa' });

    const res = await request(app)
      .get(`${BASE}/me/payment-methods`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.paymentMethods).toHaveLength(1);
    expect(res.body.data.paymentMethods[0].last4).toBe('4242');
    expect(res.body.data.paymentMethods[0].brand).toBe('Visa');
  });

  it('returns an empty list when user has no payment methods', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}/me/payment-methods`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.paymentMethods).toHaveLength(0);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(`${BASE}/me/payment-methods`);
    expect(res.status).toBe(401);
  });
});

// ─── POST /users/me/payment-methods ───────────────────────────────────────

describe('POST /users/me/payment-methods', () => {
  it('adds a payment method and returns it (201)', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/me/payment-methods`)
      .set('Authorization', authHeader(user._id))
      .send({ type: 'card', last4: '4242', brand: 'Visa' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.paymentMethod.type).toBe('card');
    expect(res.body.data.paymentMethod.last4).toBe('4242');
  });

  it('returns 400 when type is missing', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/me/payment-methods`)
      .set('Authorization', authHeader(user._id))
      .send({ last4: '4242' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post(`${BASE}/me/payment-methods`)
      .send({ type: 'card' });

    expect(res.status).toBe(401);
  });
});
