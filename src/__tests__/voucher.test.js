const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Voucher = require('../models/Voucher');

const BASE = '/api/v1/vouchers';

// ─── Helpers ───────────────────────────────────────────────────────────────

async function createUser() {
  const hashed = await bcrypt.hash('password123', 10);
  return User.create({ name: 'Test User', email: 'test@example.com', password: hashed });
}

function authHeader(userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  return `Bearer ${token}`;
}

function futureDate(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function pastDate(days = 1) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─── GET /vouchers ─────────────────────────────────────────────────────────

describe('GET /vouchers', () => {
  it('returns active, non-expired vouchers (200)', async () => {
    const user = await createUser();
    await Voucher.create({ title: 'SAVE10', discountAmount: 10, expiresAt: futureDate(), active: true });
    await Voucher.create({ title: 'SAVE20', discountAmount: 20, expiresAt: futureDate(14), active: true });

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('excludes expired vouchers', async () => {
    const user = await createUser();
    await Voucher.create({ title: 'VALID', discountAmount: 10, expiresAt: futureDate(), active: true });
    await Voucher.create({ title: 'EXPIRED', discountAmount: 5, expiresAt: pastDate(), active: true });

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('VALID');
  });

  it('excludes inactive vouchers', async () => {
    const user = await createUser();
    await Voucher.create({ title: 'ACTIVE', discountAmount: 10, expiresAt: futureDate(), active: true });
    await Voucher.create({ title: 'INACTIVE', discountAmount: 5, expiresAt: futureDate(), active: false });

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('ACTIVE');
  });

  it('returns an empty list when no vouchers are available', async () => {
    const user = await createUser();

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});
