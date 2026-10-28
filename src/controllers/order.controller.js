const mongoose = require('mongoose');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const Voucher = require('../models/Voucher');
const PaymentMethod = require('../models/PaymentMethod');
const { locationError, distanceKm } = require('../utils/location');

const { STATUS_STEPS } = Order;
const MIN_PER_KM = 3; // rough rider speed, 20 km/h in town
const DEFAULT_PREP_MINS = 15; // when a restaurant has no deliveryTimeMins
const { getIO } = require('../socket');
const { handleError } = require('../utils/handleError');
const { parsePage } = require('../utils/listQuery');
const Rating = require('../models/Rating');
const { updateAverageRating } = require('./rating.controller');

const TABS = {
  active: ['placed', 'accepted', 'preparing', 'on_the_way'],
  completed: ['delivered'],
  cancelled: ['cancelled'],
};

// An order as the app shows it: the stored fields plus its restaurant and item count.
function orderView(order, restaurant) {
  const o = typeof order.toObject === 'function' ? order.toObject() : order;
  return {
    ...o,
    restaurant: restaurant ? { _id: restaurant._id, name: restaurant.name } : null,
    itemCount: o.items.reduce((sum, i) => sum + i.qty, 0),
  };
}

async function viewOne(order) {
  return orderView(order, await Restaurant.findById(order.restaurantId, 'name').lean());
}

// GET /orders?tab=active|completed|cancelled&page&limit: placed orders, newest first.
// Without tab, every placed order (cart orders are never listed).
exports.getOrders = async (req, res) => {
  try {
    const { tab } = req.query;
    if (tab !== undefined && !TABS[tab])
      return res.status(400).json({ success: false, message: `tab must be one of: ${Object.keys(TABS).join(', ')}` });
    const { page, limit } = parsePage(req.query);

    const filter = { userId: req.user._id, status: tab ? { $in: TABS[tab] } : { $ne: 'pending' } };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    const restaurants = await Restaurant.find({ _id: { $in: orders.map((o) => o.restaurantId) } }, 'name').lean();
    const byId = new Map(restaurants.map((r) => [String(r._id), r]));
    const items = orders.map((o) => orderView(o, byId.get(String(o.restaurantId))));
    return res.json({ success: true, data: { items, page, totalPages: Math.ceil(total / limit), total } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { restaurantId, items } = req.body;
    if (!restaurantId || !items || !items.length)
      return res.status(400).json({ success: false, message: 'restaurantId and items are required' });

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ success: false, message: 'Restaurant not found' });

    const orderItems = await Promise.all(
      items.map(async ({ menuItemId, qty }) => {
        const menuItem = await MenuItem.findById(menuItemId);
        if (!menuItem)
          throw Object.assign(new Error(`Menu item ${menuItemId} not found`), { status: 404 });
        return {
          menuItemId: menuItem._id,
          name: menuItem.name,
          photoUrl: menuItem.photoUrl,
          restaurantName: restaurant.name,
          qty: Number(qty),
          price: menuItem.price,
        };
      })
    );

    const subTotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const deliveryCharge = 10;

    const order = await Order.create({
      userId: req.user._id,
      restaurantId,
      items: orderItems,
      subTotal,
      deliveryCharge,
      total: subTotal + deliveryCharge,
    });

    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    if (err.status === 404)
      return res.status(404).json({ success: false, message: err.message });
    return handleError(res, err);
  }
};

exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    return res.json({ success: true, data: await viewOne(order) });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.updateOrderItem = async (req, res) => {
  try {
    const qty = Number(req.body.qty);
    if (!validQty(qty))
      return res.status(400).json({ success: false, message: `qty must be a whole number from 1 to ${MAX_QTY}` });

    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'pending')
      return res.status(400).json({ success: false, message: 'Order has already been placed' });

    const item = order.items.id(req.params.itemId);
    if (!item)
      return res.status(404).json({ success: false, message: 'Item not found in order' });

    item.qty = qty;
    recalculate(order);
    await order.save();

    return res.json({ success: true, data: { order, cartCount: await cartCount(req.user._id) } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.removeOrderItem = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'pending')
      return res.status(400).json({ success: false, message: 'Order has already been placed' });

    const item = order.items.id(req.params.itemId);
    if (!item)
      return res.status(404).json({ success: false, message: 'Item not found in order' });

    item.deleteOne();
    recalculate(order);
    await order.save();

    return res.json({ success: true, data: { order, cartCount: await cartCount(req.user._id) } });
  } catch (err) {
    return handleError(res, err);
  }
};

// Removes one restaurant's order from the cart ("Cancel Order" before checkout).
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'pending')
      return res.status(400).json({ success: false, message: 'Only orders still in the cart can be removed' });

    await order.deleteOne();
    return res.json({ success: true, data: { cartCount: await cartCount(req.user._id) } });
  } catch (err) {
    return handleError(res, err);
  }
};

// Dev only (route not mounted in production): moves a placed order one step along
// STATUS_STEPS until restaurants and drivers exist (phase 6).
exports.advanceOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    const step = STATUS_STEPS.indexOf(order.status);
    if (step < 0 || step === STATUS_STEPS.length - 1)
      return res.status(400).json({ success: false, message: `Order is ${order.status}; there is no next step` });

    setStatus(order, STATUS_STEPS[step + 1], new Date());
    await order.save();
    emitStatus(req.user._id, order);
    return res.json({ success: true, data: order });
  } catch (err) {
    return handleError(res, err);
  }
};

function setStatus(order, status, at) {
  order.status = status;
  order.statusHistory.push({ status, at });
}

function emitStatus(userId, order) {
  getIO()?.to(String(userId)).emit('order:status', { orderId: order._id, status: order.status });
}

const MAX_QTY = 99;
const validQty = (qty) => Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY;

// Total qty across the user's pending orders: the cart badge.
async function cartCount(userId) {
  const [row] = await Order.aggregate([
    { $match: { userId, status: 'pending' } },
    { $unwind: '$items' },
    { $group: { _id: null, count: { $sum: '$items.qty' } } },
  ]);
  return row?.count ?? 0;
}

// Adds a dish to the user's pending order for its restaurant (made if missing). The same
// dish and option merge into one line. With no optionId the dish's first option is used.
exports.addToCart = async (req, res) => {
  try {
    const { menuItemId, qty, optionId } = req.body;
    if (!mongoose.isValidObjectId(menuItemId))
      return res.status(400).json({ success: false, message: 'menuItemId is required' });
    if (!validQty(qty))
      return res.status(400).json({ success: false, message: `qty must be a whole number from 1 to ${MAX_QTY}` });

    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem)
      return res.status(404).json({ success: false, message: 'Menu item not found' });

    let option = menuItem.options[0] ?? null;
    if (optionId != null) {
      option = mongoose.isValidObjectId(optionId) ? menuItem.options.id(optionId) : null;
      if (!option)
        return res.status(400).json({ success: false, message: 'optionId is not an option of this dish' });
    }

    const { order, error } = await addDish(req.user._id, menuItem, option, qty);
    if (error) return res.status(400).json({ success: false, message: error });

    return res.json({ success: true, data: { order, cartCount: await cartCount(req.user._id) } });
  } catch (err) {
    return handleError(res, err);
  }
};

// Puts qty of a dish into the user's pending order for its restaurant; the same dish
// and option merge into one line. Returns { order } or { error } when over MAX_QTY,
// unless clamp is set, which caps the line at MAX_QTY instead.
async function addDish(userId, menuItem, option, qty, { clamp = false } = {}) {
  const restaurant = await Restaurant.findById(menuItem.restaurantId, 'name');
  const owner = { userId, restaurantId: menuItem.restaurantId, status: 'pending' };
  // Upsert so two quick taps do not both create an order
  const order = await Order.findOneAndUpdate(owner, { $setOnInsert: owner }, {
    upsert: true, new: true, sort: { createdAt: -1 },
  });

  const optionKey = String(option?._id ?? '');
  const line = order.items.find((l) => String(l.menuItemId) === String(menuItem._id) && String(l.optionId ?? '') === optionKey);
  const price = menuItem.price + (option?.extraPrice ?? 0);
  if (line) {
    if (line.qty + qty > MAX_QTY && !clamp) return { error: `At most ${MAX_QTY} of one dish per order` };
    line.qty = Math.min(line.qty + qty, MAX_QTY);
    line.price = price;
  } else {
    order.items.push({
      menuItemId: menuItem._id,
      name: menuItem.name,
      photoUrl: menuItem.photoUrl,
      restaurantName: restaurant?.name,
      qty: Math.min(qty, MAX_QTY),
      price,
      optionId: option?._id,
      optionName: option?.name,
    });
  }
  recalculate(order);
  await order.save();
  return { order };
}

// POST /orders/:id/reorder: adds a placed order's dishes to the cart. Deleted dishes are
// skipped; a portion that no longer exists falls back to the dish's default portion.
exports.reorder = async (req, res) => {
  try {
    const order = await findOwnOrder(req);
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'pending')
      return res.status(400).json({ success: false, message: 'This order is still in your cart' });

    const dishes = await MenuItem.find({ _id: { $in: order.items.map((i) => i.menuItemId) } });
    const byId = new Map(dishes.map((d) => [String(d._id), d]));
    let added = 0;
    const skipped = [];
    for (const line of order.items) {
      const dish = byId.get(String(line.menuItemId));
      if (!dish) {
        skipped.push(line.name);
        continue;
      }
      const option = (line.optionId && dish.options.id(line.optionId)) || dish.options[0] || null;
      await addDish(req.user._id, dish, option, line.qty, { clamp: true });
      added += 1;
    }
    return res.json({ success: true, data: { cartCount: await cartCount(req.user._id), added, skipped } });
  } catch (err) {
    return handleError(res, err);
  }
};

const findOwnOrder = (req) =>
  mongoose.isValidObjectId(req.params.id) ? Order.findOne({ _id: req.params.id, userId: req.user._id }) : null;

const CANCELLABLE = ['placed', 'accepted'];

// POST /orders/:id/cancel { reason, note? }: only while placed or accepted.
exports.cancelOrder = async (req, res) => {
  try {
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 100)
      return res.status(400).json({ success: false, message: 'reason must be 1 to 100 characters' });
    const { note } = req.body;
    if (note != null && (typeof note !== 'string' || note.trim().length > 300))
      return res.status(400).json({ success: false, message: 'note must be at most 300 characters' });

    const order = await findOwnOrder(req);
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });
    if (!CANCELLABLE.includes(order.status))
      return res.status(409).json({ success: false, message: cancelRefusal(order.status) });

    const now = new Date();
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: { $in: CANCELLABLE } }, // the restaurant may move it on meanwhile
      {
        $set: {
          status: 'cancelled',
          cancelReason: reason,
          ...(note?.trim() && { cancelNote: note.trim() }),
          // No charge is taken yet (no Paystack), so a card or MoMo refund is only a label
          ...(order.paymentStatus === 'pending' && { paymentStatus: 'refunded' }),
        },
        $push: { statusHistory: { status: 'cancelled', at: now } },
      },
      { new: true }
    );
    if (!updated) {
      const { status } = await Order.findById(order._id, 'status').lean();
      return res.status(409).json({ success: false, message: cancelRefusal(status) });
    }
    emitStatus(req.user._id, updated);
    return res.json({ success: true, data: { order: await viewOne(updated) } });
  } catch (err) {
    return handleError(res, err);
  }
};

function cancelRefusal(status) {
  if (status === 'cancelled') return 'This order is already cancelled';
  if (status === 'pending') return 'This order is still in your cart; remove it there instead';
  if (status === 'delivered') return 'This order has already been delivered';
  return 'The restaurant has started on this order, so it can no longer be cancelled';
}

// Made-up rider until real drivers exist.
const DEMO_RIDER = { name: 'Kwabena Owusu', phone: '+233200000000' };

// Ride length in minutes: distance at MIN_PER_KM, or DEV_RIDE_MINUTES outside production.
function rideMinutes(from, to) {
  const dev = Number(process.env.DEV_RIDE_MINUTES);
  if (process.env.NODE_ENV !== 'production' && dev > 0) return dev;
  if (!from) return 1;
  return Math.max(1, distanceKm(from.latitude, from.longitude, to.latitude, to.longitude) * MIN_PER_KM);
}

const minutesSince = (date, now) => (date ? (now - date) / 60000 : 0);
const statusAt = (order, status) => order.statusHistory.find((s) => s.status === status)?.at;

// GET /orders/:id/tracking: where the (simulated) rider is. The rider appears at the
// restaurant when the order goes on_the_way and moves in a straight line to the
// destination over the ride time; it waits there until the order is delivered.
exports.getTracking = async (req, res) => {
  try {
    const order = await findOwnOrder(req);
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'pending')
      return res.status(400).json({ success: false, message: 'This order has not been placed' });

    const restaurant = await Restaurant.findById(order.restaurantId, 'name location').lean();
    const coords = restaurant?.location?.coordinates; // GeoJSON: [lng, lat]
    const from = coords ? { latitude: coords[1], longitude: coords[0] } : null;
    const to = order.deliveryAddress ?? {};
    const ride = rideMinutes(from, to);
    const now = new Date();

    let progress = 0;
    let etaMinutes = null;
    if (order.status === 'on_the_way') {
      progress = Math.min(1, minutesSince(statusAt(order, 'on_the_way'), now) / ride);
      etaMinutes = Math.ceil(ride * (1 - progress));
    } else if (order.status === 'delivered') {
      progress = 1;
      etaMinutes = 0;
    } else if (order.status !== 'cancelled') {
      const left = (order.estimatedMinutes ?? ride) - minutesSince(statusAt(order, 'placed'), now);
      etaMinutes = Math.ceil(Math.max(left, ride));
    }

    let rider = null;
    if (order.status === 'on_the_way' || order.status === 'delivered') {
      const start = from ?? to;
      rider = {
        latitude: start.latitude + (to.latitude - start.latitude) * progress,
        longitude: start.longitude + (to.longitude - start.longitude) * progress,
        ...DEMO_RIDER,
      };
    }

    return res.json({
      success: true,
      data: {
        status: order.status,
        restaurant: { name: restaurant?.name ?? null, latitude: from?.latitude ?? null, longitude: from?.longitude ?? null },
        destination: { latitude: to.latitude, longitude: to.longitude, address: to.address },
        rider,
        etaMinutes,
        progress: Math.round(progress * 1000) / 1000,
      },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

const validStars = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
const commentError = (c) => c != null && (typeof c !== 'string' || c.trim().length > 500);

// POST /orders/:id/review { dishes: [{ menuItemId, rating, comment? }], restaurant: { rating, comment? } }
// Once per delivered order. Dishes may be a subset of the order's dishes.
exports.reviewOrder = async (req, res) => {
  try {
    const order = await findOwnOrder(req);
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    const { dishes, restaurant } = req.body;
    if (!Array.isArray(dishes))
      return res.status(400).json({ success: false, message: 'dishes must be a list' });
    if (!restaurant || !validStars(restaurant.rating) || commentError(restaurant.comment))
      return res.status(400).json({ success: false, message: 'restaurant needs a rating from 1 to 5 and a comment of at most 500 characters' });
    const inOrder = new Set(order.items.map((i) => String(i.menuItemId)));
    const seen = new Set();
    for (const d of dishes) {
      const id = String(d?.menuItemId);
      if (!inOrder.has(id) || seen.has(id))
        return res.status(400).json({ success: false, message: 'Each dish must be from this order, once' });
      if (!validStars(d.rating) || commentError(d.comment))
        return res.status(400).json({ success: false, message: 'Each dish needs a rating from 1 to 5 and a comment of at most 500 characters' });
      seen.add(id);
    }

    if (order.status !== 'delivered')
      return res.status(409).json({ success: false, message: 'You can rate an order once it has been delivered' });
    if (order.reviewed)
      return res.status(409).json({ success: false, message: 'You have already rated this order' });

    const comment = (c) => c?.trim() || undefined;
    const ratings = [
      ...dishes.map((d) => ({ targetId: d.menuItemId, targetType: 'food', stars: d.rating, feedback: comment(d.comment) })),
      { targetId: order.restaurantId, targetType: 'restaurant', stars: restaurant.rating, feedback: comment(restaurant.comment) },
    ].map((r) => ({ ...r, orderId: order._id, userId: req.user._id }));

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const { modifiedCount } = await Order.updateOne(
          { _id: order._id, status: 'delivered', reviewed: { $ne: true } }, { $set: { reviewed: true } }, { session }
        );
        if (!modifiedCount) throw Object.assign(new Error('Order already reviewed'), { status: 409 });
        await Rating.insertMany(ratings, { session });
      });
    } finally {
      await session.endSession();
    }

    // Dish pages show testimonials, as POST /ratings/food does
    const userName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
    for (const d of dishes) {
      await MenuItem.updateOne({ _id: d.menuItemId }, {
        $push: { testimonials: { userId: req.user._id, userName, userPhotoUrl: req.user.photoUrl, stars: d.rating, comment: comment(d.comment) } },
      });
      await updateAverageRating(MenuItem, d.menuItemId);
    }
    await updateAverageRating(Restaurant, order.restaurantId);

    return res.json({ success: true, data: { order: await viewOne(await Order.findById(order._id)) } });
  } catch (err) {
    if (err.status === 409)
      return res.status(409).json({ success: false, message: 'You have already rated this order' });
    return handleError(res, err);
  }
};

const round2 = (n) => Math.round(n * 100) / 100;
const sumBy = (list, fn) => round2(list.reduce((s, x) => s + fn(x), 0));

// Pending orders that still have items, newest first; one per restaurant.
const cartOrders = (userId) =>
  Order.find({ userId, status: 'pending', 'items.0': { $exists: true } }).sort({ createdAt: -1, _id: -1 });

// Money for the whole cart. discounts: Map of orderId -> GHS from applyVoucher.
function summarize(orders, discounts = new Map()) {
  const subTotal = sumBy(orders, (o) => o.subTotal);
  const deliveryCharge = sumBy(orders, (o) => o.deliveryCharge);
  const discount = sumBy(orders, (o) => discounts.get(String(o._id)) ?? 0);
  return { subTotal, deliveryCharge, discount, total: round2(subTotal + deliveryCharge - discount) };
}

// Checks a voucher code against the cart: { voucher, discounts } or { error }.
// One flat discount per checkout, split across the orders it applies to by subtotal
// (the last order takes the rounding remainder). A user can use each code once.
async function applyVoucher(code, userId, orders) {
  if (typeof code !== 'string' || !code.trim()) return { error: 'code is required' };
  const voucher = await Voucher.findOne({ code: code.trim().toUpperCase(), active: true })
    .populate('restaurantId', 'name');
  if (!voucher) return { error: 'Voucher code not found' };
  if (voucher.expiresAt && voucher.expiresAt <= new Date()) return { error: 'This voucher has expired' };
  if (await Order.exists({ userId, voucherId: voucher._id, status: { $nin: ['pending', 'cancelled'] } }))
    return { error: 'You have already used this voucher' };

  const only = voucher.restaurantId;
  const eligible = only ? orders.filter((o) => o.restaurantId.equals(only._id)) : orders;
  const from = only ? ` from ${only.name}` : '';
  if (!eligible.length) return { error: `This voucher is only for orders${from}` };
  const eligibleSub = sumBy(eligible, (o) => o.subTotal);
  if (eligibleSub < voucher.minSubTotal)
    return { error: `Spend at least GHS ${voucher.minSubTotal}${from} to use this voucher` };

  const amount = Math.min(voucher.discountAmount, eligibleSub);
  const discounts = new Map();
  let given = 0;
  eligible.forEach((o, i) => {
    const share = i === eligible.length - 1 ? round2(amount - given) : round2((amount * o.subTotal) / eligibleSub);
    given = round2(given + share);
    discounts.set(String(o._id), share);
  });
  return { voucher, discounts };
}

const voucherInfo = (v) => ({
  _id: v._id,
  code: v.code,
  title: v.title,
  discountAmount: v.discountAmount,
  minSubTotal: v.minSubTotal,
  restaurant: v.restaurantId ? { _id: v.restaurantId._id, name: v.restaurantId.name } : null,
});

const discountList = (discounts) => [...discounts].map(([orderId, discount]) => ({ orderId, discount }));

exports.getCart = async (req, res) => {
  try {
    const orders = await cartOrders(req.user._id);
    const count = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0), 0);
    return res.json({ success: true, data: { orders, cartCount: count, summary: summarize(orders) } });
  } catch (err) {
    return handleError(res, err);
  }
};

// POST /cart/voucher { code }: the summary with the discount, without placing anything.
exports.checkVoucher = async (req, res) => {
  try {
    const orders = await cartOrders(req.user._id);
    if (!orders.length)
      return res.status(400).json({ success: false, message: 'Your cart is empty' });

    const { error, voucher, discounts } = await applyVoucher(req.body.code, req.user._id, orders);
    if (error) return res.status(400).json({ success: false, message: error });

    return res.json({
      success: true,
      data: { voucher: voucherInfo(voucher), summary: summarize(orders, discounts), discounts: discountList(discounts) },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

// POST /cart/place: places every pending order at once, in one transaction.
exports.placeCart = async (req, res) => {
  try {
    const { deliveryAddress, paymentMethodId, paymentType, voucherCode } = req.body;
    const badAddress = locationError(deliveryAddress);
    if (badAddress)
      return res.status(400).json({ success: false, message: `deliveryAddress: ${badAddress}` });

    const cash = paymentType === 'cash';
    if (cash === (paymentMethodId != null) || (paymentType != null && !cash))
      return res.status(400).json({ success: false, message: 'Send either paymentMethodId or paymentType "cash"' });

    let method = null;
    if (!cash) {
      method = mongoose.isValidObjectId(paymentMethodId)
        && await PaymentMethod.findOne({ _id: paymentMethodId, userId: req.user._id });
      if (!method)
        return res.status(400).json({ success: false, message: 'Payment method not found' });
    }

    const orders = await cartOrders(req.user._id);
    if (!orders.length)
      return res.status(400).json({ success: false, message: 'Your cart is empty' });

    let voucher = null;
    let discounts = new Map();
    if (voucherCode != null) {
      const applied = await applyVoucher(voucherCode, req.user._id, orders);
      if (applied.error) return res.status(400).json({ success: false, message: applied.error });
      ({ voucher, discounts } = applied);
    }

    const restaurants = await Restaurant.find({ _id: { $in: orders.map((o) => o.restaurantId) } }, 'location deliveryTimeMins').lean();
    const byId = new Map(restaurants.map((r) => [String(r._id), r]));
    const address = {
      address: deliveryAddress.address.trim(),
      latitude: deliveryAddress.latitude,
      longitude: deliveryAddress.longitude,
    };
    const estimate = (r) => {
      const prep = r?.deliveryTimeMins ?? DEFAULT_PREP_MINS;
      if (!r?.location) return prep;
      const [lng, lat] = r.location.coordinates;
      return Math.round(prep + distanceKm(lat, lng, address.latitude, address.longitude) * MIN_PER_KM);
    };

    const now = new Date();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const order of orders) {
          const discount = discounts.get(String(order._id)) ?? 0;
          // updatedAt in the filter: an order edited since we read it fails the whole checkout
          const { matchedCount } = await Order.updateOne(
            { _id: order._id, status: 'pending', updatedAt: order.updatedAt },
            {
              $set: {
                status: 'placed',
                statusHistory: [{ status: 'placed', at: now }],
                deliveryAddress: address,
                ...(method && { paymentMethodId: method._id }),
                paymentType: cash ? 'cash' : method.type,
                paymentStatus: cash ? 'cash' : 'pending',
                ...(discount && { voucherId: voucher._id }),
                discount,
                total: round2(order.subTotal + order.deliveryCharge - discount),
                estimatedMinutes: estimate(byId.get(String(order.restaurantId))),
              },
            },
            { session }
          );
          if (!matchedCount) throw Object.assign(new Error('Cart changed during checkout'), { status: 409 });
        }
      });
    } finally {
      await session.endSession();
    }

    const placed = await Order.find({ _id: { $in: orders.map((o) => o._id) } }).sort({ createdAt: -1, _id: -1 });
    for (const order of placed) emitStatus(req.user._id, order);
    const summary = summarize(placed, discounts);
    return res.json({ success: true, data: { orders: placed, total: summary.total, summary } });
  } catch (err) {
    if (err.status === 409)
      return res.status(409).json({ success: false, message: 'Your cart changed while checking out. Please review it and try again.' });
    return handleError(res, err);
  }
};

function recalculate(order) {
  order.subTotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  order.total = order.subTotal + order.deliveryCharge - order.discount;
}
