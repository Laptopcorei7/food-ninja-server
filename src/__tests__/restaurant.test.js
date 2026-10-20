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
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.total).toBe(2);
  });

  it('filters restaurants by search query (200)', async () => {
    const user = await createUser();
    await createRestaurant({ name: 'Burger Place' });
    await createRestaurant({ name: 'Pizza Palace' });

    const res = await request(app)
      .get(`${BASE}?search=pizza`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('Pizza Palace');
  });

  it('returns empty list when no restaurants match search', async () => {
    const user = await createUser();
    await createRestaurant({ name: 'Burger Place' });

    const res = await request(app)
      .get(`${BASE}?search=sushi`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it('treats search text literally, not as a regex (200)', async () => {
    const user = await createUser();
    await createRestaurant({ name: 'Burger Place' });

    const res = await request(app)
      .get(`${BASE}?search=(`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('filters by any of several categories and paginates', async () => {
    const user = await createUser();
    await createRestaurant({ name: 'A', categories: ['rice'], rating: 3 });
    await createRestaurant({ name: 'B', categories: ['grills', 'drinks'], rating: 5 });
    await createRestaurant({ name: 'C', categories: ['pizza-burgers'], rating: 4 });

    const res = await request(app)
      .get(`${BASE}?category=rice,grills&limit=1&page=2`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 2, totalPages: 2, total: 2 });
    expect(res.body.data.items.map((r) => r.name)).toEqual(['A']);
    expect(res.body.data.items[0].distanceKm).toBeNull();
  });

  it('rejects an unknown category (400)', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}?category=sushi`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Unknown category: sushi');
  });

  it('keeps restaurants rated at least minRating', async () => {
    const user = await createUser();
    await createRestaurant({ name: 'Low', rating: 3.9 });
    await createRestaurant({ name: 'High', rating: 4 });

    const res = await request(app)
      .get(`${BASE}?minRating=4`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((r) => r.name)).toEqual(['High']);
  });

  it('rejects minRating above 5 (400)', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}?minRating=5.5`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(400);
  });

  it('rejects lat without lng (400)', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}?lat=5.6`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(400);
  });

  describe('with lat/lng', () => {
    const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });

    beforeAll(() => Restaurant.init()); // $geoNear needs the 2dsphere index

    beforeEach(async () => {
      await createRestaurant({ name: 'East Legon', location: point(5.636, -0.158), rating: 3 });
      await createRestaurant({ name: 'Madina', location: point(5.669, -0.166), rating: 5 });
      await createRestaurant({ name: 'Osu', location: point(5.556, -0.182), rating: 4 });
    });

    it('sorts by distance by default and returns distanceKm', async () => {
      const user = await createUser();
      const res = await request(app)
        .get(`${BASE}?lat=5.635&lng=-0.157`)
        .set('Authorization', authHeader(user._id));

      expect(res.status).toBe(200);
      expect(res.body.data.items.map((r) => r.name)).toEqual(['East Legon', 'Madina', 'Osu']);
      expect(res.body.data.items[0].distanceKm).toBeCloseTo(0.2, 1);
    });

    it('drops restaurants beyond maxKm', async () => {
      const user = await createUser();
      const res = await request(app)
        .get(`${BASE}?lat=5.635&lng=-0.157&maxKm=5&sort=rating`)
        .set('Authorization', authHeader(user._id));

      expect(res.status).toBe(200);
      expect(res.body.data.items.map((r) => r.name)).toEqual(['Madina', 'East Legon']);
    });
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
    expect(res.body.data.distanceKm).toBeNull();
  });

  it('adds distanceKm when given lat/lng', async () => {
    await Restaurant.init(); // $geoNear needs the 2dsphere index
    const user = await createUser();
    const restaurant = await createRestaurant({ location: { type: 'Point', coordinates: [-0.158, 5.636] } });

    const res = await request(app)
      .get(`${BASE}/${restaurant._id}?lat=5.635&lng=-0.157`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.distanceKm).toBeCloseTo(0.2, 1);
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
