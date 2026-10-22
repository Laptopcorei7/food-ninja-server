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

  it('returns null / false / [] for every unset onboarding field on a new account', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', authHeader(user._id));

    expect(res.body.data.user).toMatchObject({
      firstName: null,
      lastName: null,
      phone: null,
      phoneVerified: false,
      photo: null,
      location: null,
      paymentMethods: [],
    });
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

  it('clears phoneVerified when the phone changes', async () => {
    const user = await createUser({ phoneNumber: '+233501234567', phoneVerified: true });
    const res = await request(app)
      .patch(`${BASE}/me/profile`)
      .set('Authorization', authHeader(user._id))
      .send({ phone: '+233509999999' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.phoneVerified).toBe(false);
  });

  it('returns 400 and keeps the old phone for a local-format phone', async () => {
    const user = await createUser({ phoneNumber: '+233501234567' });
    const res = await request(app)
      .patch(`${BASE}/me/profile`)
      .set('Authorization', authHeader(user._id))
      .send({ firstName: 'John', phone: '0241234567' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('phone must be in international format, e.g. +233241234567');
    const stored = await User.findById(user._id);
    expect(stored.phoneNumber).toBe('+233501234567');
    expect(stored.firstName).not.toBe('John');
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

  it('stores and returns a relative /uploads path', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/me/photo`)
      .set('Authorization', authHeader(user._id))
      .attach('photo', Buffer.from('fake'), { filename: 'me.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.data.photoUrl).toMatch(/^\/uploads\/[^/]+\.jpg$/);
    await require('fs').promises.unlink(require('path').join(__dirname, '..', '..', res.body.data.photoUrl));

    const me = await request(app).get(`${BASE}/me`).set('Authorization', authHeader(user._id));
    expect(me.body.data.user.photo).toBe(res.body.data.photoUrl);
  });

  it('returns JSON 400 for a non-image file', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/me/photo`)
      .set('Authorization', authHeader(user._id))
      .attach('photo', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Only JPEG, PNG or WebP images are allowed' });
  });

  it('returns JSON 413 for a photo over 5 MB', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/me/photo`)
      .set('Authorization', authHeader(user._id))
      .attach('photo', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ success: false, message: 'Photo must be under 5 MB' });
  });

  it('returns JSON 400, not an HTML page, for a malformed JSON body', async () => {
    const user = await createUser();
    const res = await request(app)
      .patch(`${BASE}/me/profile`)
      .set('Authorization', authHeader(user._id))
      .set('Content-Type', 'application/json')
      .send('{"firstName":');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
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
    expect(res.body.data.paymentMethod.brand).toBe('visa');
  });

  it('adds mobile money and rejects full numbers, a card brand on MoMo, and unknown networks', async () => {
    const user = await createUser();
    const post = (body) => request(app).post(`${BASE}/me/payment-methods`).set('Authorization', authHeader(user._id)).send(body);

    const momo = await post({ type: 'momo', network: 'MTN', last4: '1234' });
    expect(momo.status).toBe(201);
    expect(momo.body.data.paymentMethod).toMatchObject({ type: 'momo', network: 'mtn', last4: '1234', brand: null });

    expect((await post({ type: 'card', last4: '4242424242424242' })).status).toBe(400);
    expect((await post({ type: 'momo', brand: 'visa' })).status).toBe(400);
    expect((await post({ type: 'momo', network: 'vodafone' })).status).toBe(400);
    expect((await post({ type: 'cash' })).status).toBe(400);
  });

  it('PATCH fills in card details and DELETE removes the method', async () => {
    const user = await createUser();
    const auth = authHeader(user._id);
    const created = await request(app).post(`${BASE}/me/payment-methods`).set('Authorization', auth).send({ type: 'card' });
    const id = created.body.data.paymentMethod._id;

    const patched = await request(app).patch(`${BASE}/me/payment-methods/${id}`).set('Authorization', auth)
      .send({ brand: 'mastercard', last4: '5555' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.paymentMethod).toMatchObject({ brand: 'mastercard', last4: '5555' });
    const bad = await request(app).patch(`${BASE}/me/payment-methods/${id}`).set('Authorization', auth).send({ last4: '55' });
    expect(bad.status).toBe(400);

    const other = await createUser({ email: 'other@example.com' });
    const notMine = await request(app).patch(`${BASE}/me/payment-methods/${id}`).set('Authorization', authHeader(other._id)).send({ last4: '1111' });
    expect(notMine.status).toBe(404);

    const del = await request(app).delete(`${BASE}/me/payment-methods/${id}`).set('Authorization', auth);
    expect(del.status).toBe(200);
    const list = await request(app).get(`${BASE}/me/payment-methods`).set('Authorization', auth);
    expect(list.body.data.paymentMethods).toEqual([]);
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

// ─── /users/me/addresses ───────────────────────────────────────────────────

describe('/users/me/addresses', () => {
  const ADDR = `${BASE}/me/addresses`;
  const home = { label: 'Home', address: 'Lagos Avenue, East Legon', latitude: 5.636, longitude: -0.165 };

  it('adds, lists, updates and removes saved addresses', async () => {
    const user = await createUser();
    const auth = authHeader(user._id);

    const created = await request(app).post(ADDR).set('Authorization', auth).send(home);
    expect(created.status).toBe(201);
    expect(created.body.data.address).toMatchObject(home);
    const id = created.body.data.address._id;

    const patched = await request(app).patch(`${ADDR}/${id}`).set('Authorization', auth).send({ label: 'Work' });
    expect(patched.body.data.address).toMatchObject({ ...home, label: 'Work' });

    const list = await request(app).get(ADDR).set('Authorization', auth);
    expect(list.body.data.addresses).toHaveLength(1);

    const del = await request(app).delete(`${ADDR}/${id}`).set('Authorization', auth);
    expect(del.body.data.addresses).toEqual([]);
    const again = await request(app).delete(`${ADDR}/${id}`).set('Authorization', auth);
    expect(again.status).toBe(404);
  });

  it('rejects a missing label, out-of-range coordinates and a bad id', async () => {
    const user = await createUser();
    const auth = authHeader(user._id);
    const post = (body) => request(app).post(ADDR).set('Authorization', auth).send(body);

    expect((await post({ ...home, label: ' ' })).status).toBe(400);
    expect((await post({ ...home, latitude: 91 })).status).toBe(400);
    expect((await post({ ...home, longitude: '-0.1' })).status).toBe(400);
    expect((await request(app).patch(`${ADDR}/nope`).set('Authorization', auth).send({ label: 'X' })).status).toBe(400);
  });
});
