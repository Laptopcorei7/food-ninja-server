const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const Voucher = require('../models/Voucher');
const { getIO } = require('../socket');

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, data: orders, total: orders.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
        if (!menuItem) throw new Error(`Menu item ${menuItemId} not found`);
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
    const status = err.message.includes('not found') ? 404 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    return res.json({ success: true, data: order });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateOrderItem = async (req, res) => {
  try {
    const { qty } = req.body;
    if (!qty || Number(qty) < 1)
      return res.status(400).json({ success: false, message: 'qty must be at least 1' });

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
    return res.status(500).json({ success: false, message: err.message });
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
    return res.status(500).json({ success: false, message: err.message });
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
    return res.status(500).json({ success: false, message: err.message });
  }
};

function recalculate(order) {
  order.subTotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  order.total = order.subTotal + order.deliveryCharge - order.discount;
}
