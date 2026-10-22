const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');

const BASE = '/api/v1/orders';

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
  return Restaurant.create({ name: 'Burger Place' });
}

async function createMenuItem(restaurantId, overrides = {}) {
  return MenuItem.create({
    restaurantId,
    name: 'Cheeseburger',
    price: 12,
    ...overrides,
  });
}

async function createOrder(userId, restaurantId, items) {
  const subTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  return Order.create({
    userId,
    restaurantId,
    items,
    subTotal,
    deliveryCharge: 10,
    total: subTotal + 10,
  });
}

// ─── GET /orders ───────────────────────────────────────────────────────────

describe('GET /orders', () => {
  it('returns all orders for the current user (200)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 2 },
    ]);

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('does not return other users\' orders', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const restaurant = await createRestaurant();
    await createOrder(other._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});

// ─── POST /orders ──────────────────────────────────────────────────────────

describe('POST /orders', () => {
  it('creates an order from restaurant + menu items (201)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const item = await createMenuItem(restaurant._id);

    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(user._id))
      .send({
        restaurantId: restaurant._id.toString(),
        items: [{ menuItemId: item._id.toString(), qty: 2 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.subTotal).toBe(24);
    expect(res.body.data.deliveryCharge).toBe(10);
    expect(res.body.data.total).toBe(34);
    expect(res.body.data.status).toBe('pending');
  });

  it('returns 400 when restaurantId is missing', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const item = await createMenuItem(restaurant._id);

    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(user._id))
      .send({ items: [{ menuItemId: item._id.toString(), qty: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when items array is empty', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();

    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(user._id))
      .send({ restaurantId: restaurant._id.toString(), items: [] });

    expect(res.status).toBe(400);
  });

  it('returns 404 when restaurant does not exist', async () => {
    const user = await createUser();
    const fakeId = '000000000000000000000001';

    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader(user._id))
      .send({
        restaurantId: fakeId,
        items: [{ menuItemId: fakeId, qty: 1 }],
      });

    expect(res.status).toBe(404);
  });
});

// ─── GET /orders/:id ───────────────────────────────────────────────────────

describe('GET /orders/:id', () => {
  it('returns a single order by ID (200)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);

    const res = await request(app)
      .get(`${BASE}/${order._id}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(order._id.toString());
  });

  it('returns 404 for another user\'s order', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const restaurant = await createRestaurant();
    const order = await createOrder(other._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);

    const res = await request(app)
      .get(`${BASE}/${order._id}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(404);
  });
});

// ─── PUT /orders/:id/items/:itemId ─────────────────────────────────────────

describe('PUT /orders/:id/items/:itemId', () => {
  it('updates item qty and recalculates totals (200)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);
    const itemId = order.items[0]._id.toString();

    const res = await request(app)
      .put(`${BASE}/${order._id}/items/${itemId}`)
      .set('Authorization', authHeader(user._id))
      .send({ qty: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].qty).toBe(3);
    expect(res.body.data.subTotal).toBe(36);
    expect(res.body.data.total).toBe(46);
  });

  it('returns 400 when qty is 0 or missing', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);
    const itemId = order.items[0]._id.toString();

    const res = await request(app)
      .put(`${BASE}/${order._id}/items/${itemId}`)
      .set('Authorization', authHeader(user._id))
      .send({ qty: 0 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for a non-existent itemId', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);
    const fakeItemId = '000000000000000000000001';

    const res = await request(app)
      .put(`${BASE}/${order._id}/items/${fakeItemId}`)
      .set('Authorization', authHeader(user._id))
      .send({ qty: 2 });

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /orders/:id/items/:itemId ──────────────────────────────────────

describe('DELETE /orders/:id/items/:itemId', () => {
  it('removes an item from the order and recalculates totals (200)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
      { menuItemId: restaurant._id, name: 'Fries', price: 5, qty: 2 },
    ]);
    const itemId = order.items[0]._id.toString();

    const res = await request(app)
      .delete(`${BASE}/${order._id}/items/${itemId}`)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.subTotal).toBe(10);
  });
});

// ─── POST /orders/:id/place ────────────────────────────────────────────────

describe('POST /orders/:id/place', () => {
  it('places the order and changes status to processing (200)', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);

    const res = await request(app)
      .post(`${BASE}/${order._id}/place`)
      .set('Authorization', authHeader(user._id))
      .send({
        paymentMethodId: '000000000000000000000001',
        deliveryAddress: { address: '123 Main St', latitude: 5.6037, longitude: -0.187 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('processing');
    expect(res.body.data.deliveryAddress.address).toBe('123 Main St');
  });

  it('returns 400 when the order has already been placed', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);
    await Order.findByIdAndUpdate(order._id, { status: 'processing' });

    const res = await request(app)
      .post(`${BASE}/${order._id}/place`)
      .set('Authorization', authHeader(user._id))
      .send({
        paymentMethodId: '000000000000000000000001',
        deliveryAddress: '123 Main St',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order has already been placed');
  });

  it('returns 400 when paymentMethodId is missing', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);

    const res = await request(app)
      .post(`${BASE}/${order._id}/place`)
      .set('Authorization', authHeader(user._id))
      .send({ deliveryAddress: { address: '123 Main St', latitude: 5.6037, longitude: -0.187 } });

    expect(res.status).toBe(400);
  });

  it('returns 404 for another user\'s order', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const restaurant = await createRestaurant();
    const order = await createOrder(other._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);

    const res = await request(app)
      .post(`${BASE}/${order._id}/place`)
      .set('Authorization', authHeader(user._id))
      .send({
        paymentMethodId: '000000000000000000000001',
        deliveryAddress: '123 Main St',
      });

    expect(res.status).toBe(404);
  });
});

// ─── /cart ─────────────────────────────────────────────────────────────────

describe('/cart', () => {
  const CART = '/api/v1/cart';
  const add = (user, body) => request(app).post(`${CART}/items`).set('Authorization', authHeader(user._id)).send(body);

  async function createPizza(restaurantId) {
    return createMenuItem(restaurantId, {
      name: 'Margherita',
      price: 95,
      options: [{ name: 'Small', extraPrice: 0 }, { name: 'Large', extraPrice: 50 }],
    });
  }

  it('merges the same dish and option into one line and totals the order', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const pizza = await createPizza(restaurant._id);
    const large = pizza.options[1]._id;

    await add(user, { menuItemId: pizza._id, qty: 1, optionId: large });
    const res = await add(user, { menuItemId: pizza._id, qty: 2, optionId: large });

    expect(res.status).toBe(200);
    const { order, cartCount } = res.body.data;
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ qty: 3, price: 145, optionName: 'Large', restaurantName: 'Burger Place' });
    expect(order.items[0].optionId).toBe(String(large));
    expect(order).toMatchObject({ status: 'pending', subTotal: 435, total: 445 });
    expect(cartCount).toBe(3);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('uses the first option when none is sent and keeps other options on their own line', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const pizza = await createPizza(restaurant._id);

    await add(user, { menuItemId: pizza._id, qty: 1 });
    const res = await add(user, { menuItemId: pizza._id, qty: 1, optionId: pizza.options[1]._id });

    expect(res.body.data.order.items.map((i) => [i.optionName, i.price])).toEqual([['Small', 95], ['Large', 145]]);
    expect(res.body.data.order.subTotal).toBe(240);
  });

  it('keeps one pending order per restaurant and GET /cart counts across them', async () => {
    const user = await createUser();
    const burger = await createMenuItem((await createRestaurant())._id);
    const waakye = await createMenuItem((await Restaurant.create({ name: 'Waakye Joint' }))._id, { name: 'Waakye', price: 30 });

    await add(user, { menuItemId: burger._id, qty: 2 });
    const res = await add(user, { menuItemId: waakye._id, qty: 1 });
    expect(res.body.data.cartCount).toBe(3);
    expect(res.body.data.order.items[0].optionId).toBeUndefined(); // dish without options

    const cart = await request(app).get(CART).set('Authorization', authHeader(user._id));
    expect(cart.status).toBe(200);
    expect(cart.body.data.cartCount).toBe(3);
    expect(cart.body.data.orders.map((o) => o.items[0].name)).toEqual(['Waakye', 'Cheeseburger']);
  });

  it('rejects bad qty, an option from another dish, and a merge past 99', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const pizza = await createPizza(restaurant._id);
    const other = await createPizza(restaurant._id);

    for (const qty of [0, 100, 1.5, '2', undefined])
      expect((await add(user, { menuItemId: pizza._id, qty })).status).toBe(400);
    expect((await add(user, { menuItemId: pizza._id, qty: 1, optionId: other.options[0]._id })).status).toBe(400);
    expect((await add(user, { menuItemId: pizza._id, qty: 1, optionId: 'nope' })).status).toBe(400);
    expect((await add(user, { menuItemId: 'nope', qty: 1 })).status).toBe(400);
    expect((await add(user, { menuItemId: '000000000000000000000001', qty: 1 })).status).toBe(404);

    await add(user, { menuItemId: pizza._id, qty: 60 });
    const over = await add(user, { menuItemId: pizza._id, qty: 40 });
    expect(over.status).toBe(400);
  });

  it('PUT and DELETE on a cart line recompute totals', async () => {
    const user = await createUser();
    const pizza = await createPizza((await createRestaurant())._id);
    const added = await add(user, { menuItemId: pizza._id, qty: 1, optionId: pizza.options[1]._id });
    const { _id: orderId, items: [line] } = added.body.data.order;

    const put = await request(app)
      .put(`${BASE}/${orderId}/items/${line._id}`)
      .set('Authorization', authHeader(user._id))
      .send({ qty: 2 });
    expect(put.body.data).toMatchObject({ subTotal: 290, total: 300 });

    const del = await request(app)
      .delete(`${BASE}/${orderId}/items/${line._id}`)
      .set('Authorization', authHeader(user._id));
    expect(del.body.data).toMatchObject({ subTotal: 0, total: 10 });

    const cart = await request(app).get(CART).set('Authorization', authHeader(user._id));
    expect(cart.body.data).toEqual({ orders: [], cartCount: 0 });
  });
});
