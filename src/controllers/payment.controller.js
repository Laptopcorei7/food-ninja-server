const PaymentMethod = require('../models/PaymentMethod');
const User = require('../models/User');
const { handleError } = require('../utils/handleError');

exports.listPayments = async (req, res) => {
  try {
    const payments = await PaymentMethod.find({ userId: req.user._id });
    return res.json({ success: true, data: payments, total: payments.length });
  } catch (err) {
    return handleError(res, err);
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
    return handleError(res, err);
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
    return handleError(res, err);
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
    return handleError(res, err);
  }
};
