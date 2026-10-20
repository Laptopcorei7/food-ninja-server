const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');

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

  it('filters by minRating and maxPrice; priceRange ignores maxPrice', async () => {
    const user = await createUser();
    const r = await Restaurant.create({ name: 'Mix' });
    await MenuItem.create({ restaurantId: r._id, name: 'Cheap good', price: 10, rating: 4.6, description: 'Tasty' });
    await MenuItem.create({ restaurantId: r._id, name: 'Dear good', price: 90, rating: 4.8 });
    await MenuItem.create({ restaurantId: r._id, name: 'Cheap poor', price: 5, rating: 3 });

    const res = await request(app)
      .get(`${BASE}?minRating=4.5&maxPrice=50`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => i.name)).toEqual(['Cheap good']);
    expect(res.body.data.items[0]).toMatchObject({ description: 'Tasty', rating: 4.6, tags: [] });
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.priceRange).toEqual({ min: 10, max: 90 });
  });

  it('returns priceRange null when nothing matches', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(`${BASE}?search=nothing`)
      .set('Authorization', authHeader(user._id));

    expect(res.body.data.priceRange).toBeNull();
  });

  it.each(['minRating=6', 'minRating=-1', 'minRating=abc', 'minRating=', 'maxPrice=-5', 'maxPrice=x'])(
    'rejects %s (400)',
    async (param) => {
      const user = await createUser();
      const res = await request(app)
        .get(`${BASE}?${param}`)
        .set('Authorization', authHeader(user._id));

      expect(res.status).toBe(400);
    }
  );
});

// ─── GET /menu-items/for-you ───────────────────────────────────────────────

describe('GET /menu-items/for-you', () => {
  const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });
  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  beforeAll(() => Restaurant.init()); // $geoNear needs the 2dsphere index

  // Order with a chosen createdAt (timestamps make createdAt immutable through Mongoose).
  async function placeOrder(userId, restaurantId, item, { status = 'delivered', createdAt = daysAgo(5) } = {}) {
    const order = await Order.create({ userId, restaurantId, status, items: [{ menuItemId: item._id, qty: 1, price: item.price }] });
    await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt } });
  }

  it('without placed orders: top rated first, then nearest', async () => {
    const user = await createUser();
    const near = await Restaurant.create({ name: 'Near', location: point(5.636, -0.158) });
    const far = await Restaurant.create({ name: 'Far', location: point(5.669, -0.166) });
    const nearDish = await MenuItem.create({ restaurantId: near._id, name: 'Near 4.5', price: 10, rating: 4.5 });
    await MenuItem.create({ restaurantId: far._id, name: 'Far 4.5', price: 10, rating: 4.5 });
    await MenuItem.create({ restaurantId: far._id, name: 'Far 4.9', price: 10, rating: 4.9 });
    await placeOrder(user._id, near._id, nearDish, { status: 'pending' }); // not placed, so ignored

    const res = await request(app)
      .get(`${BASE}/for-you?lat=5.635&lng=-0.157`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => i.name)).toEqual(['Far 4.9', 'Near 4.5', 'Far 4.5']);
    expect(res.body.data.items[0]).toMatchObject({ restaurant: { name: 'Far' } });
    expect(res.body.data.items[0].score).toBeUndefined();
  });

  it('ranks by ordered category and restaurant, and leaves out dishes ordered in the last 2 days', async () => {
    const user = await createUser();
    const usual = await Restaurant.create({ name: 'Usual' });
    const other = await Restaurant.create({ name: 'Other' });
    const jollof = await MenuItem.create({ restaurantId: usual._id, name: 'Jollof', price: 40, category: 'rice', rating: 4 });
    const waakye = await MenuItem.create({ restaurantId: usual._id, name: 'Waakye', price: 35, category: 'rice', rating: 4 });
    await MenuItem.create({ restaurantId: other._id, name: 'Fried Rice', price: 30, category: 'rice', rating: 4 });
    await MenuItem.create({ restaurantId: other._id, name: 'Top Cake', price: 30, category: 'desserts', rating: 5 });
    await placeOrder(user._id, usual._id, jollof);
    await placeOrder(user._id, usual._id, waakye, { createdAt: daysAgo(1) });

    const res = await request(app)
      .get(`${BASE}/for-you`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    // Waakye was ordered yesterday, so it is left out.
    expect(res.body.data.items.map((i) => i.name)).toEqual(['Jollof', 'Fried Rice', 'Top Cake']);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(`${BASE}/for-you`);
    expect(res.status).toBe(401);
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
