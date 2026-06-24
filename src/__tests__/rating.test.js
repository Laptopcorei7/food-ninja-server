const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Rating = require('../models/Rating');

const BASE = '/api/v1/ratings';

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

async function createRestaurant() {
  return Restaurant.create({ name: 'Burger Place', rating: 0 });
}

async function createMenuItem(restaurantId) {
  return MenuItem.create({ restaurantId, name: 'Cheeseburger', price: 12, rating: 0 });
}

// ─── POST /ratings/food ────────────────────────────────────────────────────

describe('POST /ratings/food', () => {
  it('creates a food rating and returns it (201)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const menuItem = await createMenuItem(restaurant._id);

    const res = await request(app)
      .post(`${BASE}/food`)
      .set('Authorization', authHeader(user._id))
      .send({
        orderId: '000000000000000000000001',
        menuItemId: menuItem._id.toString(),
        stars: 4,
        feedback: 'Really good!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stars).toBe(4);
    expect(res.body.data.targetType).toBe('food');
  });

  it('adds a testimonial to the menu item', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const menuItem = await createMenuItem(restaurant._id);

    await request(app)
      .post(`${BASE}/food`)
      .set('Authorization', authHeader(user._id))
      .send({
        orderId: '000000000000000000000001',
        menuItemId: menuItem._id.toString(),
        stars: 5,
        feedback: 'Amazing!',
      });

    const updated = await MenuItem.findById(menuItem._id);
    expect(updated.testimonials).toHaveLength(1);
    expect(updated.testimonials[0].stars).toBe(5);
    expect(updated.testimonials[0].comment).toBe('Amazing!');
  });

  it('updates the average rating on the menu item', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const menuItem = await createMenuItem(restaurant._id);

    await request(app)
      .post(`${BASE}/food`)
      .set('Authorization', authHeader(user._id))
      .send({ orderId: '000000000000000000000001', menuItemId: menuItem._id.toString(), stars: 4 });

    const user2 = await createUser({ email: 'user2@example.com' });
    await request(app)
      .post(`${BASE}/food`)
      .set('Authorization', authHeader(user2._id))
      .send({ orderId: '000000000000000000000002', menuItemId: menuItem._id.toString(), stars: 2 });

    const updated = await MenuItem.findById(menuItem._id);
    expect(updated.rating).toBe(3); // (4 + 2) / 2 = 3
  });

  it('returns 400 when required fields are missing', async () => {
    const user = await createUser();

    const res = await request(app)
      .post(`${BASE}/food`)
      .set('Authorization', authHeader(user._id))
      .send({ orderId: '000000000000000000000001', stars: 4 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when menu item does not exist', async () => {
    const user = await createUser();
    const fakeId = '000000000000000000000001';

    const res = await request(app)
      .post(`${BASE}/food`)
      .set('Authorization', authHeader(user._id))
      .send({ orderId: fakeId, menuItemId: fakeId, stars: 4 });

    expect(res.status).toBe(404);
  });
});

// ─── POST /ratings/restaurant ──────────────────────────────────────────────

describe('POST /ratings/restaurant', () => {
  it('creates a restaurant rating (201)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();

    const res = await request(app)
      .post(`${BASE}/restaurant`)
      .set('Authorization', authHeader(user._id))
      .send({
        orderId: '000000000000000000000001',
        restaurantId: restaurant._id.toString(),
        stars: 5,
        feedback: 'Great service!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.targetType).toBe('restaurant');
  });

  it('updates the average rating on the restaurant', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();

    await request(app)
      .post(`${BASE}/restaurant`)
      .set('Authorization', authHeader(user._id))
      .send({ orderId: '000000000000000000000001', restaurantId: restaurant._id.toString(), stars: 5 });

    const user2 = await createUser({ email: 'user2@example.com' });
    await request(app)
      .post(`${BASE}/restaurant`)
      .set('Authorization', authHeader(user2._id))
      .send({ orderId: '000000000000000000000002', restaurantId: restaurant._id.toString(), stars: 3 });

    const updated = await Restaurant.findById(restaurant._id);
    expect(updated.rating).toBe(4); // (5 + 3) / 2 = 4
  });

  it('returns 400 when required fields are missing', async () => {
    const user = await createUser();

    const res = await request(app)
      .post(`${BASE}/restaurant`)
      .set('Authorization', authHeader(user._id))
      .send({ orderId: '000000000000000000000001' });

    expect(res.status).toBe(400);
  });
});

// ─── POST /ratings/driver ──────────────────────────────────────────────────

describe('POST /ratings/driver', () => {
  it('creates a driver rating (201)', async () => {
    const user = await createUser();

    const res = await request(app)
      .post(`${BASE}/driver`)
      .set('Authorization', authHeader(user._id))
      .send({
        orderId: '000000000000000000000001',
        driverId: '000000000000000000000002',
        stars: 5,
        feedback: 'Fast delivery!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.targetType).toBe('driver');
    expect(res.body.data.stars).toBe(5);
  });

  it('returns 400 when required fields are missing', async () => {
    const user = await createUser();

    const res = await request(app)
      .post(`${BASE}/driver`)
      .set('Authorization', authHeader(user._id))
      .send({ orderId: '000000000000000000000001' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post(`${BASE}/driver`)
      .send({ orderId: '000000000000000000000001', driverId: '000000000000000000000002', stars: 5 });

    expect(res.status).toBe(401);
  });
});
