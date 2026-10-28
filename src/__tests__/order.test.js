const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const Voucher = require('../models/Voucher');
const PaymentMethod = require('../models/PaymentMethod');

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
  const withStatus = async (userId, restaurantId, status) => {
    const order = await createOrder(userId, restaurantId, [{ menuItemId: restaurantId, name: 'Burger', price: 12, qty: 2 }]);
    return Order.findByIdAndUpdate(order._id, { status }, { new: true });
  };

  it('lists placed orders by tab, newest first, with restaurant, itemCount and reviewed', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    await withStatus(user._id, restaurant._id, 'pending'); // the cart: never listed
    const placed = await withStatus(user._id, restaurant._id, 'placed');
    const onTheWay = await withStatus(user._id, restaurant._id, 'on_the_way');
    await withStatus(user._id, restaurant._id, 'delivered');
    await withStatus(user._id, restaurant._id, 'cancelled');
    const auth = authHeader(user._id);

    const res = await request(app).get(`${BASE}?tab=active`).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 1, totalPages: 1, total: 2 });
    expect(res.body.data.items.map((o) => o._id)).toEqual([String(onTheWay._id), String(placed._id)]);
    expect(res.body.data.items[0]).toMatchObject({
      restaurant: { _id: String(restaurant._id), name: 'Burger Place' }, itemCount: 2, reviewed: false, total: 34,
    });

    expect((await request(app).get(`${BASE}?tab=completed`).set('Authorization', auth)).body.data.total).toBe(1);
    expect((await request(app).get(`${BASE}?tab=cancelled`).set('Authorization', auth)).body.data.total).toBe(1);
    expect((await request(app).get(BASE).set('Authorization', auth)).body.data.total).toBe(4);
    const page2 = await request(app).get(`${BASE}?tab=active&page=2&limit=1`).set('Authorization', auth);
    expect(page2.body.data).toMatchObject({ page: 2, totalPages: 2, total: 2 });
    expect(page2.body.data.items[0]._id).toBe(String(placed._id));
    expect((await request(app).get(`${BASE}?tab=old`).set('Authorization', auth)).status).toBe(400);
  });

  it('does not return other users\' orders', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const restaurant = await createRestaurant();
    await withStatus(other._id, restaurant._id, 'placed');

    const res = await request(app)
      .get(BASE)
      .set('Authorization', authHeader(user._id));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
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
    expect(res.body.data.order.items[0].qty).toBe(3);
    expect(res.body.data.order.subTotal).toBe(36);
    expect(res.body.data.order.total).toBe(46);
    expect(res.body.data.cartCount).toBe(3);
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
    expect(res.body.data.order.items).toHaveLength(1);
    expect(res.body.data.order.subTotal).toBe(10);
    expect(res.body.data.cartCount).toBe(2);
  });

  it('returns 400 once the order is placed', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [
      { menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 1 },
    ]);
    await Order.updateOne({ _id: order._id }, { status: 'placed' });

    const res = await request(app)
      .delete(`${BASE}/${order._id}/items/${order.items[0]._id}`)
      .set('Authorization', authHeader(user._id));
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /orders/:id and POST /orders/:id/advance ───────────────────────

describe('DELETE /orders/:id', () => {
  it('removes a pending order and returns cartCount; placed orders and other users get 400/404', async () => {
    const user = await createUser();
    const other = await createUser({ email: 'other@example.com' });
    const restaurant = await createRestaurant();
    const line = [{ menuItemId: restaurant._id, name: 'Burger', price: 12, qty: 2 }];
    const pending = await createOrder(user._id, restaurant._id, line);
    const kept = await createOrder(user._id, restaurant._id, line);
    const placed = await createOrder(user._id, restaurant._id, line);
    await Order.updateOne({ _id: placed._id }, { status: 'placed' });
    const auth = authHeader(user._id);

    const res = await request(app).delete(`${BASE}/${pending._id}`).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ cartCount: 2 });
    expect(await Order.exists({ _id: kept._id })).toBeTruthy();

    expect((await request(app).delete(`${BASE}/${placed._id}`).set('Authorization', auth)).status).toBe(400);
    expect((await request(app).delete(`${BASE}/${kept._id}`).set('Authorization', authHeader(other._id))).status).toBe(404);
  });
});

describe('POST /orders/:id/advance (dev)', () => {
  it('steps a placed order through to delivered with a timestamp per step', async () => {
    const user = await createUser();
    const restaurant = await createRestaurant();
    const order = await createOrder(user._id, restaurant._id, [{ name: 'Burger', price: 12, qty: 1 }]);
    const auth = authHeader(user._id);

    expect((await request(app).post(`${BASE}/${order._id}/advance`).set('Authorization', auth)).status).toBe(400);
    await Order.updateOne({ _id: order._id }, { status: 'placed', statusHistory: [{ status: 'placed', at: new Date() }] });

    let res;
    for (const next of ['accepted', 'preparing', 'on_the_way', 'delivered']) {
      res = await request(app).post(`${BASE}/${order._id}/advance`).set('Authorization', auth);
      expect(res.body.data.status).toBe(next);
    }
    expect(res.body.data.statusHistory.map((s) => s.status)).toEqual(['placed', 'accepted', 'preparing', 'on_the_way', 'delivered']);
    expect((await request(app).post(`${BASE}/${order._id}/advance`).set('Authorization', auth)).status).toBe(400);
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
    expect(put.body.data.order).toMatchObject({ subTotal: 290, total: 300 });
    expect(put.body.data.cartCount).toBe(2);

    const del = await request(app)
      .delete(`${BASE}/${orderId}/items/${line._id}`)
      .set('Authorization', authHeader(user._id));
    expect(del.body.data.order).toMatchObject({ subTotal: 0, total: 10 });
    expect(del.body.data.cartCount).toBe(0);

    const cart = await request(app).get(CART).set('Authorization', authHeader(user._id));
    expect(cart.body.data).toEqual({
      orders: [], cartCount: 0, summary: { subTotal: 0, deliveryCharge: 0, discount: 0, total: 0 },
    });
  });
});

// ─── Checkout: summary, vouchers, POST /cart/place ─────────────────────────

describe('checkout', () => {
  const CART = '/api/v1/cart';
  const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });
  const address = { address: 'Lagos Avenue, East Legon', latitude: 5.636, longitude: -0.165 };
  const day = 24 * 60 * 60 * 1000;

  // Two restaurants in the cart: Burger Place GHS 60 (2 x 30), Pizzeria GHS 140 (1 x 140).
  async function twoOrderCart() {
    const user = await createUser();
    const burgers = await Restaurant.create({ name: 'Burger Place', location: point(5.636, -0.165), deliveryTimeMins: 12 });
    const pizzeria = await Restaurant.create({ name: 'Pizzeria', location: point(5.604, -0.173), deliveryTimeMins: 20 });
    const burger = await createMenuItem(burgers._id, { price: 30 });
    const pizza = await createMenuItem(pizzeria._id, { name: 'Pizza', price: 140 });
    const auth = authHeader(user._id);
    await request(app).post(`${CART}/items`).set('Authorization', auth).send({ menuItemId: burger._id, qty: 2 });
    await request(app).post(`${CART}/items`).set('Authorization', auth).send({ menuItemId: pizza._id, qty: 1 });
    return { user, auth, burgers, pizzeria };
  }

  const voucher = (overrides = {}) => Voucher.create({
    title: 'Treat', code: 'TREAT20', discountAmount: 20, expiresAt: new Date(Date.now() + day), ...overrides,
  });

  it('GET /cart sums both orders', async () => {
    const { auth } = await twoOrderCart();
    const res = await request(app).get(CART).set('Authorization', auth);
    expect(res.body.data.summary).toEqual({ subTotal: 200, deliveryCharge: 20, discount: 0, total: 220 });
  });

  it('POST /cart/voucher splits a flat discount across orders by subtotal', async () => {
    const { auth } = await twoOrderCart();
    await voucher();
    const res = await request(app).post(`${CART}/voucher`).set('Authorization', auth).send({ code: 'treat20 ' });
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ subTotal: 200, deliveryCharge: 20, discount: 20, total: 200 });
    expect(res.body.data.discounts.map((d) => d.discount).sort()).toEqual([14, 6]); // 60/200 and 140/200 of 20
    expect(res.body.data.voucher).toMatchObject({ code: 'TREAT20', restaurant: null });
  });

  it('a restaurant voucher only discounts that order, and its minimum counts only that order', async () => {
    const { auth, burgers } = await twoOrderCart();
    await voucher({ code: 'BURGER', discountAmount: 10, minSubTotal: 50, restaurantId: burgers._id });
    const res = await request(app).post(`${CART}/voucher`).set('Authorization', auth).send({ code: 'BURGER' });
    expect(res.body.data.discounts).toHaveLength(1);
    expect(res.body.data.voucher.restaurant.name).toBe('Burger Place');
    expect(res.body.data.summary.discount).toBe(10);

    await voucher({ code: 'BIGBURGER', minSubTotal: 61, restaurantId: burgers._id });
    const short = await request(app).post(`${CART}/voucher`).set('Authorization', auth).send({ code: 'BIGBURGER' });
    expect(short.status).toBe(400);
    expect(short.body.message).toBe('Spend at least GHS 61 from Burger Place to use this voucher');
  });

  it('rejects unknown and expired codes, and an empty cart', async () => {
    const { auth } = await twoOrderCart();
    await voucher({ code: 'OLD', expiresAt: new Date(Date.now() - day) });
    expect((await request(app).post(`${CART}/voucher`).set('Authorization', auth).send({ code: 'NOPE' })).body.message)
      .toBe('Voucher code not found');
    expect((await request(app).post(`${CART}/voucher`).set('Authorization', auth).send({ code: 'OLD' })).body.message)
      .toBe('This voucher has expired');

    const empty = await createUser({ email: 'empty@example.com' });
    const res = await request(app).post(`${CART}/voucher`).set('Authorization', authHeader(empty._id)).send({ code: 'OLD' });
    expect(res.body.message).toBe('Your cart is empty');
  });

  it('POST /cart/place places every order with a card, the voucher and estimates', async () => {
    const { user, auth } = await twoOrderCart();
    await voucher();
    const card = await PaymentMethod.create({ userId: user._id, type: 'card', brand: 'visa', last4: '4242' });

    const res = await request(app).post(`${CART}/place`).set('Authorization', auth)
      .send({ deliveryAddress: address, paymentMethodId: card._id, voucherCode: 'TREAT20' });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(200);
    expect(res.body.data.summary).toEqual({ subTotal: 200, deliveryCharge: 20, discount: 20, total: 200 });
    const byName = Object.fromEntries(res.body.data.orders.map((o) => [o.items[0].restaurantName, o]));
    expect(byName['Burger Place']).toMatchObject({
      status: 'placed', paymentType: 'card', paymentStatus: 'pending', discount: 6, total: 64, estimatedMinutes: 12,
    });
    expect(byName.Pizzeria).toMatchObject({ discount: 14, total: 136 });
    expect(byName.Pizzeria.estimatedMinutes).toBeGreaterThan(30); // 20 prep + about 3.6 km at 3 min/km
    expect(byName.Pizzeria.statusHistory).toEqual([{ status: 'placed', at: expect.any(String) }]);
    expect(byName.Pizzeria.deliveryAddress).toEqual(address);

    const cart = await request(app).get(CART).set('Authorization', auth);
    expect(cart.body.data.cartCount).toBe(0);

    // Once per user: a new cart cannot use the code again
    const burger = await MenuItem.findOne({ price: 30 });
    await request(app).post(`${CART}/items`).set('Authorization', auth).send({ menuItemId: burger._id, qty: 1 });
    const again = await request(app).post(`${CART}/voucher`).set('Authorization', auth).send({ code: 'TREAT20' });
    expect(again.body.message).toBe('You have already used this voucher');
  });

  it('places with cash on delivery', async () => {
    const { auth } = await twoOrderCart();
    const res = await request(app).post(`${CART}/place`).set('Authorization', auth)
      .send({ deliveryAddress: address, paymentType: 'cash' });
    expect(res.status).toBe(200);
    expect(res.body.data.orders.every((o) => o.paymentType === 'cash' && o.paymentStatus === 'cash')).toBe(true);
    expect(res.body.data.total).toBe(220);
  });

  it('rejects a bad address, missing or foreign payment, and a bad voucher, placing nothing', async () => {
    const { auth } = await twoOrderCart();
    const other = await createUser({ email: 'other@example.com' });
    const theirs = await PaymentMethod.create({ userId: other._id, type: 'card' });
    const place = (body) => request(app).post(`${CART}/place`).set('Authorization', auth).send(body);

    expect((await place({ deliveryAddress: { ...address, latitude: 100 }, paymentType: 'cash' })).status).toBe(400);
    expect((await place({ deliveryAddress: '123 Main St', paymentType: 'cash' })).status).toBe(400);
    expect((await place({ deliveryAddress: address })).status).toBe(400);
    expect((await place({ deliveryAddress: address, paymentType: 'card' })).status).toBe(400);
    expect((await place({ deliveryAddress: address, paymentType: 'cash', paymentMethodId: theirs._id })).status).toBe(400);
    expect((await place({ deliveryAddress: address, paymentMethodId: theirs._id })).body.message).toBe('Payment method not found');
    expect((await place({ deliveryAddress: address, paymentType: 'cash', voucherCode: 'NOPE' })).status).toBe(400);

    expect(await Order.countDocuments({ status: 'pending' })).toBe(2);
  });

  it('returns 400 for an empty cart', async () => {
    const user = await createUser();
    const res = await request(app).post(`${CART}/place`).set('Authorization', authHeader(user._id))
      .send({ deliveryAddress: address, paymentType: 'cash' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Your cart is empty');
  });
});

// ─── After the order: cancel, tracking, review, reorder ────────────────────

describe('after the order', () => {
  const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });
  const home = { address: 'Lagos Avenue, East Legon', latitude: 5.64, longitude: -0.16 };
  const minutesAgo = (m) => new Date(Date.now() - m * 60000);

  // A placed order of 2 burgers and 1 drink from a restaurant at (5.60, -0.20).
  async function placedOrder(status = 'placed', extra = {}) {
    const user = await createUser();
    const restaurant = await Restaurant.create({ name: 'Burger Place', location: point(5.6, -0.2), rating: 4.7 });
    const burger = await createMenuItem(restaurant._id, { price: 30, rating: 4.5, options: [{ name: 'Regular' }, { name: 'Large', extraPrice: 5 }] });
    const drink = await createMenuItem(restaurant._id, { name: 'Sobolo', price: 8 });
    const order = await Order.create({
      userId: user._id,
      restaurantId: restaurant._id,
      items: [
        { menuItemId: burger._id, name: 'Cheeseburger', qty: 2, price: 35, optionId: burger.options[1]._id, optionName: 'Large' },
        { menuItemId: drink._id, name: 'Sobolo', qty: 1, price: 8 },
      ],
      status,
      statusHistory: [{ status: 'placed', at: minutesAgo(5) }],
      deliveryAddress: home,
      paymentType: 'card',
      paymentStatus: 'pending',
      estimatedMinutes: 40,
      subTotal: 78,
      total: 88,
      ...extra,
    });
    return { user, auth: authHeader(user._id), restaurant, burger, drink, order };
  }

  describe('POST /orders/:id/cancel', () => {
    it('cancels a placed order, keeps the reason and note, and marks a card payment refunded', async () => {
      const { auth, order } = await placedOrder();
      const res = await request(app).post(`${BASE}/${order._id}/cancel`).set('Authorization', auth)
        .send({ reason: ' Ordered by mistake ', note: 'Wrong address' });
      expect(res.status).toBe(200);
      expect(res.body.data.order).toMatchObject({
        status: 'cancelled', cancelReason: 'Ordered by mistake', cancelNote: 'Wrong address', paymentStatus: 'refunded',
        restaurant: { name: 'Burger Place' }, itemCount: 3,
      });
      expect(res.body.data.order.statusHistory.map((s) => s.status)).toEqual(['placed', 'cancelled']);
    });

    it('leaves a cash order as cash', async () => {
      const { auth, order } = await placedOrder('accepted', { paymentType: 'cash', paymentStatus: 'cash' });
      const res = await request(app).post(`${BASE}/${order._id}/cancel`).set('Authorization', auth).send({ reason: 'Too slow' });
      expect(res.body.data.order).toMatchObject({ status: 'cancelled', paymentStatus: 'cash' });
    });

    it('refuses once the restaurant is preparing (409) and checks the reason and note (400)', async () => {
      const { auth, order } = await placedOrder('preparing');
      const send = (body) => request(app).post(`${BASE}/${order._id}/cancel`).set('Authorization', auth).send(body);
      expect((await send({ reason: '' })).status).toBe(400);
      expect((await send({ reason: 'x'.repeat(101) })).status).toBe(400);
      expect((await send({ reason: 'ok', note: 'x'.repeat(301) })).status).toBe(400);
      const res = await send({ reason: 'Changed my mind' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('The restaurant has started on this order, so it can no longer be cancelled');
      expect((await Order.findById(order._id)).status).toBe('preparing');
    });

    it('returns 404 for another user\'s order', async () => {
      const { order } = await placedOrder();
      const other = await createUser({ email: 'other@example.com' });
      const res = await request(app).post(`${BASE}/${order._id}/cancel`).set('Authorization', authHeader(other._id)).send({ reason: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /orders/:id/tracking', () => {
    afterEach(() => { delete process.env.DEV_RIDE_MINUTES; });
    const track = (auth, order) => request(app).get(`${BASE}/${order._id}/tracking`).set('Authorization', auth);

    it('has no rider before on_the_way and gives the restaurant as lat/lng (not GeoJSON order)', async () => {
      const { auth, order } = await placedOrder();
      const res = await track(auth, order);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'placed',
        restaurant: { name: 'Burger Place', latitude: 5.6, longitude: -0.2 },
        destination: home,
        rider: null,
        progress: 0,
      });
      expect(res.body.data.etaMinutes).toBe(35); // 40 estimated, placed 5 minutes ago
    });

    it('moves the rider along the line from the restaurant over the ride time', async () => {
      process.env.DEV_RIDE_MINUTES = '10';
      const { auth, order } = await placedOrder('on_the_way');
      order.statusHistory.push({ status: 'on_the_way', at: minutesAgo(5) });
      await order.save();

      const { body } = await track(auth, order);
      expect(body.data.progress).toBeCloseTo(0.5, 2);
      expect(body.data.etaMinutes).toBe(5);
      expect(body.data.rider.latitude).toBeCloseTo(5.62, 3);
      expect(body.data.rider.longitude).toBeCloseTo(-0.18, 3);
      expect(body.data.rider.name).toBeTruthy();
    });

    it('keeps the rider at the destination once the ride time is up and when delivered', async () => {
      process.env.DEV_RIDE_MINUTES = '1';
      const { auth, order } = await placedOrder('on_the_way');
      order.statusHistory.push({ status: 'on_the_way', at: minutesAgo(5) });
      await order.save();
      const late = await track(auth, order);
      expect(late.body.data).toMatchObject({ progress: 1, etaMinutes: 0, rider: { latitude: 5.64, longitude: -0.16 } });

      await Order.updateOne({ _id: order._id }, { status: 'delivered' });
      const done = await track(auth, order);
      expect(done.body.data).toMatchObject({ status: 'delivered', progress: 1, etaMinutes: 0, rider: { latitude: 5.64 } });
    });
  });

  describe('POST /orders/:id/review', () => {
    const review = (auth, order, body) => request(app).post(`${BASE}/${order._id}/review`).set('Authorization', auth).send(body);

    it('rates dishes and the restaurant once, replacing the seeded averages', async () => {
      const { auth, order, burger, drink, restaurant } = await placedOrder('delivered');
      const res = await review(auth, order, {
        dishes: [{ menuItemId: burger._id, rating: 3, comment: 'Bit cold' }, { menuItemId: drink._id, rating: 5 }],
        restaurant: { rating: 4, comment: 'Friendly rider' },
      });
      expect(res.status).toBe(200);
      expect(res.body.data.order.reviewed).toBe(true);

      const ratedBurger = await MenuItem.findById(burger._id);
      expect(ratedBurger).toMatchObject({ rating: 3, ratingCount: 1 });
      expect(ratedBurger.testimonials[0]).toMatchObject({ stars: 3, comment: 'Bit cold', userName: 'Test User' });
      expect(await Restaurant.findById(restaurant._id)).toMatchObject({ rating: 4, ratingCount: 1 });

      const again = await review(auth, order, { dishes: [], restaurant: { rating: 1 } });
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('You have already rated this order');
      expect((await request(app).get(`${BASE}?tab=completed`).set('Authorization', auth)).body.data.items[0].reviewed).toBe(true);
    });

    it('refuses before delivery (409) and rejects bad ratings and foreign dishes (400)', async () => {
      const { auth, order, burger, restaurant } = await placedOrder('on_the_way');
      const ok = { rating: 4 };
      expect((await review(auth, order, { dishes: [], restaurant: ok })).status).toBe(409);

      await Order.updateOne({ _id: order._id }, { status: 'delivered' });
      const stranger = await createMenuItem(restaurant._id, { name: 'Not ordered' });
      expect((await review(auth, order, { dishes: [{ menuItemId: stranger._id, rating: 4 }], restaurant: ok })).status).toBe(400);
      expect((await review(auth, order, { dishes: [{ menuItemId: burger._id, rating: 4 }, { menuItemId: burger._id, rating: 4 }], restaurant: ok })).status).toBe(400);
      expect((await review(auth, order, { dishes: [{ menuItemId: burger._id, rating: 4.5 }], restaurant: ok })).status).toBe(400);
      expect((await review(auth, order, { dishes: [], restaurant: { rating: 6 } })).status).toBe(400);
      expect((await review(auth, order, { dishes: [], restaurant: { rating: 4, comment: 'x'.repeat(501) } })).status).toBe(400);
      expect((await Order.findById(order._id)).reviewed).toBe(false);
    });
  });

  describe('POST /orders/:id/reorder', () => {
    it('adds the dishes to the cart, merging with what is there, and skips deleted dishes', async () => {
      const { auth, order, burger, drink } = await placedOrder('delivered');
      await request(app).post('/api/v1/cart/items').set('Authorization', auth)
        .send({ menuItemId: burger._id, optionId: burger.options[1]._id, qty: 1 });
      await MenuItem.deleteOne({ _id: drink._id });

      const res = await request(app).post(`${BASE}/${order._id}/reorder`).set('Authorization', auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ cartCount: 3, added: 1, skipped: ['Sobolo'] });

      const cart = await Order.findOne({ status: 'pending' });
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({ qty: 3, optionName: 'Large', price: 35 });
    });

    it('refuses a cart order', async () => {
      const { auth, order } = await placedOrder('pending');
      expect((await request(app).post(`${BASE}/${order._id}/reorder`).set('Authorization', auth)).status).toBe(400);
    });
  });
});
