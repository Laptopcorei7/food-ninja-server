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

// ─── GET /menu-items ───────────────────────────────────────────────────────

describe('GET /menu-items', () => {
  const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });

  beforeAll(() => Restaurant.init()); // $geoNear needs the 2dsphere index

  async function seedTwoRestaurants() {
    const near = await Restaurant.create({ name: 'Near', location: point(5.636, -0.158) });
    const far = await Restaurant.create({ name: 'Far', location: point(5.556, -0.182) });
    await MenuItem.create({ restaurantId: near._id, name: 'Jollof Rice', price: 40, category: 'rice', orderCount: 5 });
    await MenuItem.create({ restaurantId: far._id, name: 'Waakye', price: 35, category: 'rice', orderCount: 9 });
    await MenuItem.create({ restaurantId: far._id, name: 'Sobolo', price: 10, category: 'drinks', orderCount: 20 });
  }

  it('lists items across restaurants, most ordered first, with the restaurant name', async () => {
    const user = await createUser();
    await seedTwoRestaurants();

    const res = await request(app)
      .get(`${BASE}?limit=2`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 1, totalPages: 2, total: 3 });
    expect(res.body.data.items.map((i) => i.name)).toEqual(['Sobolo', 'Waakye']);
    expect(res.body.data.items[0].restaurant.name).toBe('Far');
    expect(res.body.data.items[0].distanceKm).toBeNull();
  });

  it('combines search, category and the restaurant distance', async () => {
    const user = await createUser();
    await seedTwoRestaurants();

    const res = await request(app)
      .get(`${BASE}?category=rice&lat=5.635&lng=-0.157&maxKm=2`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => i.name)).toEqual(['Jollof Rice']);
    expect(res.body.data.items[0].distanceKm).toBeCloseTo(0.2, 1);

    const search = await request(app)
      .get(`${BASE}?search=waa`)
      .set('Authorization', authHeader(user._id));
    expect(search.body.data.items.map((i) => i.name)).toEqual(['Waakye']);
  });

  it('sorts by distance when asked', async () => {
    const user = await createUser();
    await seedTwoRestaurants();

    const res = await request(app)
      .get(`${BASE}?lat=5.635&lng=-0.157&sort=distance`)
      .set('Authorization', authHeader(user._id));

    expect(res.body.data.items[0].name).toBe('Jollof Rice');
  });
});

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
