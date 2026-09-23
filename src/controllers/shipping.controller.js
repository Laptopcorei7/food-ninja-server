const Order = require('../models/Order');
const { handleError } = require('../utils/handleError');

exports.getShipping = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, userId: req.user._id });
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    return res.json({
      success: true,
      data: {
        orderLocation: order.orderLocation,
        deliveryAddress: order.deliveryAddress,
      },
    });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.updateShipping = async (req, res) => {
  try {
    const { deliverTo } = req.body;
    if (!deliverTo)
      return res.status(400).json({ success: false, message: 'deliverTo is required' });

    const order = await Order.findOneAndUpdate(
      { _id: req.params.orderId, userId: req.user._id },
      { deliveryAddress: deliverTo },
      { new: true }
    );
    if (!order)
      return res.status(404).json({ success: false, message: 'Order not found' });

    return res.json({ success: true, data: order });
  } catch (err) {
    return handleError(res, err);
  }
};
