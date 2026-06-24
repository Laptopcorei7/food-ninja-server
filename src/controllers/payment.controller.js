const PaymentMethod = require('../models/PaymentMethod');
const User = require('../models/User');

exports.listPayments = async (req, res) => {
  try {
    const payments = await PaymentMethod.find({ userId: req.user._id });
    return res.json({ success: true, data: payments, total: payments.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const { type, details, maskedNumber } = req.body;
    if (!type || !details)
      return res.status(400).json({ success: false, message: 'type and details are required' });

    const payment = await PaymentMethod.create({ userId: req.user._id, type, details, maskedNumber });
    await User.findByIdAndUpdate(req.user._id, { $push: { paymentMethods: payment._id } });

    return res.status(201).json({ success: true, data: payment });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.setDefault = async (req, res) => {
  try {
    const payment = await PaymentMethod.findOne({ _id: req.params.id, userId: req.user._id });
    if (!payment)
      return res.status(404).json({ success: false, message: 'Payment method not found' });

    await User.findByIdAndUpdate(req.user._id, { defaultPaymentMethod: payment._id });
    return res.json({ success: true, data: { message: 'Default payment method updated' } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.removePayment = async (req, res) => {
  try {
    const payment = await PaymentMethod.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!payment)
      return res.status(404).json({ success: false, message: 'Payment method not found' });

    const updateOps = { $pull: { paymentMethods: payment._id } };
    if (req.user.defaultPaymentMethod?.toString() === payment._id.toString()) {
      updateOps.$unset = { defaultPaymentMethod: 1 };
    }
    await User.findByIdAndUpdate(req.user._id, updateOps);

    return res.json({ success: true, data: { message: 'Payment method removed' } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
