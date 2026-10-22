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

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, data: orders, total: orders.length });
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

    return res.json({ success: true, data: order });
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

    const restaurant = await Restaurant.findById(menuItem.restaurantId, 'name');
    const owner = { userId: req.user._id, restaurantId: menuItem.restaurantId, status: 'pending' };
    // Upsert so two quick taps do not both create an order
    const order = await Order.findOneAndUpdate(owner, { $setOnInsert: owner }, {
      upsert: true, new: true, sort: { createdAt: -1 },
    });

    const optionKey = String(option?._id ?? '');
    const line = order.items.find((l) => String(l.menuItemId) === String(menuItem._id) && String(l.optionId ?? '') === optionKey);
    const price = menuItem.price + (option?.extraPrice ?? 0);
    if (line) {
      if (line.qty + qty > MAX_QTY)
        return res.status(400).json({ success: false, message: `At most ${MAX_QTY} of one dish per order` });
      line.qty += qty;
      line.price = price;
    } else {
      order.items.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        photoUrl: menuItem.photoUrl,
        restaurantName: restaurant?.name,
        qty,
        price,
        optionId: option?._id,
        optionName: option?.name,
      });
    }
    recalculate(order);
    await order.save();

    return res.json({ success: true, data: { order, cartCount: await cartCount(req.user._id) } });
  } catch (err) {
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
