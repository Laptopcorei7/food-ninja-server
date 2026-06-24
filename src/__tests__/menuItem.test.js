const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');

const BASE = '/api/v1/menu-items';

// ─── Helpers ───────────────────────────────────────────────────────────────

async function createUser() {
  const hashed = await bcrypt.hash('password123', 10);
  return User.create({ name: 'Test User', email: 'test@example.com', password: hashed });
}

function authHeader(userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  return `Bearer ${token}`;
}

async function createMenuItem(overrides = {}) {
  const restaurant = await Restaurant.create({ name: 'Burger Place' });
  return MenuItem.create({
    restaurantId: restaurant._id,
    name: 'Cheeseburger',
    price: 12,
    ...overrides,
  });
}

// ─── GET /menu-items/:id ───────────────────────────────────────────────────

describe('GET /menu-items/:id', () => {
  it('returns a menu item by ID (200)', async () => {
    const user = await createUser();
    const item = await createMenuItem();

    const res = await request(app)
      .get(`${BASE}/${item._id}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Cheeseburger');
    expect(res.body.data.price).toBe(12);
  });

  it('returns 404 for a non-existent menu item', async () => {
    const user = await createUser();
    const fakeId = '000000000000000000000001';

    const res = await request(app)
      .get(`${BASE}/${fakeId}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Menu item not found');
  });

  it('returns 401 without a token', async () => {
    const item = await createMenuItem();
    const res = await request(app).get(`${BASE}/${item._id}`);
    expect(res.status).toBe(401);
  });
});
