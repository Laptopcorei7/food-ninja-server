const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');

const BASE = '/api/v1/restaurants';

// ─── Helpers ───────────────────────────────────────────────────────────────

async function createUser() {
  const hashed = await bcrypt.hash('password123', 10);
  return User.create({ name: 'Test User', email: 'test@example.com', password: hashed });
}

function authHeader(userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  return `Bearer ${token}`;
}

async function createRestaurant(overrides = {}) {
  return Restaurant.create({ name: 'Burger Place', rating: 4.5, ...overrides });
}

// ─── GET /restaurants ──────────────────────────────────────────────────────

describe('GET /restaurants', () => {
  it('returns a list of all restaurants (200)', async () => {
    const user = await createUser();
    await createRestaurant({ name: 'Burger Place' });
    await createRestaurant({ name: 'Pizza Palace' });

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('filters restaurants by search query (200)', async () => {
    const user = await createUser();
    await createRestaurant({ name: 'Burger Place' });
    await createRestaurant({ name: 'Pizza Palace' });

    const res = await request(app)
      .get(`${BASE}?search=pizza`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Pizza Palace');
  });

  it('returns empty list when no restaurants match search', async () => {
    const user = await createUser();
    await createRestaurant({ name: 'Burger Place' });

    const res = await request(app)
      .get(`${BASE}?search=sushi`)
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

// ─── GET /restaurants/:id ──────────────────────────────────────────────────

describe('GET /restaurants/:id', () => {
  it('returns a restaurant by ID (200)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();

    const res = await request(app)
      .get(`${BASE}/${restaurant._id}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Burger Place');
  });

  it('returns 404 for a non-existent restaurant', async () => {
    const user = await createUser();
    const fakeId = '000000000000000000000001';

    const res = await request(app)
      .get(`${BASE}/${fakeId}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── GET /restaurants/:id/menu ─────────────────────────────────────────────

describe('GET /restaurants/:id/menu', () => {
  it('returns menu items for the restaurant (200)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    await MenuItem.create({ restaurantId: restaurant._id, name: 'Cheeseburger', price: 12 });
    await MenuItem.create({ restaurantId: restaurant._id, name: 'Fries', price: 5 });

    const res = await request(app)
      .get(`${BASE}/${restaurant._id}/menu`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('returns an empty list for a restaurant with no items', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();

    const res = await request(app)
      .get(`${BASE}/${restaurant._id}/menu`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
