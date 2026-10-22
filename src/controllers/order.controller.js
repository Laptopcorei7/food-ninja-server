const mongoose = require('mongoose');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const Voucher = require('../models/Voucher');
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

    const item = order.items.id(req.params.itemId);
    if (!item)
      return res.status(404).json({ success: false, message: 'Item not found in order' });

    item.qty = Number(qty);
    recalculate(order);
    await order.save();

    return res.json({ success: true, data: order });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.removeOrderItem = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.items.id(req.params.itemId);
    if (!item)
      return res.status(404).json({ success: false, message: 'Item not found in order' });

    item.deleteOne();
    recalculate(order);
    await order.save();

    return res.json({ success: true, data: order });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const { paymentMethodId, deliveryAddress, voucherId } = req.body;
    if (!paymentMethodId || !deliveryAddress)
      return res.status(400).json({ success: false, message: 'paymentMethodId and deliveryAddress are required' });

    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'pending')
      return res.status(400).json({ success: false, message: 'Order has already been placed' });

    order.paymentMethodId = paymentMethodId;
    order.deliveryAddress = deliveryAddress;

    if (voucherId) {
      const voucher = await Voucher.findOne({ _id: voucherId, active: true });
      if (voucher) {
        order.voucherId = voucher._id;
        order.discount = voucher.discountAmount;
      }
    }

    order.total = order.subTotal + order.deliveryCharge - order.discount;
    order.status = 'processing';
    await order.save();

    // Notify the user's socket room that order status changed
    getIO()?.to(String(req.user._id)).emit('order:status', {
      orderId: order._id,
      status: order.status,
    });

    return res.json({ success: true, data: order });
  } catch (err) {
    return handleError(res, err);
  }
};

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

// Pending orders that still have items, newest first; one per restaurant.
exports.getCart = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id, status: 'pending', 'items.0': { $exists: true } })
      .sort({ createdAt: -1, _id: -1 });
    const count = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0), 0);
    return res.json({ success: true, data: { orders, cartCount: count } });
  } catch (err) {
    return handleError(res, err);
  }
};

function recalculate(order) {
  order.subTotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  order.total = order.subTotal + order.deliveryCharge - order.discount;
}
