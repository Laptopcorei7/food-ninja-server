const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');

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
  it('returns the current user (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('test@example.com');
  });

  it('does not include password in response', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', authHeader(user._id));

    expect(res.body.data.password).toBeUndefined();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(`${BASE}/me`);
    expect(res.status).toBe(401);
  });
});

// ─── PUT /users/profile ────────────────────────────────────────────────────

describe('PUT /users/profile', () => {
  it('updates firstName, lastName, and phoneNumber (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .put(`${BASE}/profile`)
      .set('Authorization', authHeader(user._id))
      .send({ firstName: 'John', lastName: 'Doe', phoneNumber: '+1234567890' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.firstName).toBe('John');
    expect(res.body.data.lastName).toBe('Doe');
    expect(res.body.data.phoneNumber).toBe('+1234567890');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).put(`${BASE}/profile`).send({ firstName: 'John' });
    expect(res.status).toBe(401);
  });
});

// ─── PUT /users/photo ──────────────────────────────────────────────────────

describe('PUT /users/photo', () => {
  it('returns 400 when no file is attached', async () => {
    const user = await createUser();
    const res = await request(app)
      .put(`${BASE}/photo`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('No file uploaded');
  });

  it('uploads a photo and returns a photoUrl (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .put(`${BASE}/photo`)
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
    const res = await request(app).put(`${BASE}/photo`);
    expect(res.status).toBe(401);
  });
});

// ─── PUT /users/location ───────────────────────────────────────────────────

describe('PUT /users/location', () => {
  it('updates location and returns the user (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .put(`${BASE}/location`)
      .set('Authorization', authHeader(user._id))
      .send({ address: '123 Main St', latitude: 5.6037, longitude: -0.187 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when address is missing', async () => {
    const user = await createUser();
    const res = await request(app)
      .put(`${BASE}/location`)
      .set('Authorization', authHeader(user._id))
      .send({ latitude: 5.6037, longitude: -0.187 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when latitude is missing', async () => {
    const user = await createUser();
    const res = await request(app)
      .put(`${BASE}/location`)
      .set('Authorization', authHeader(user._id))
      .send({ address: '123 Main St', longitude: -0.187 });

    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .put(`${BASE}/location`)
      .send({ address: '123 Main St', latitude: 5.6037, longitude: -0.187 });

    expect(res.status).toBe(401);
  });
});
