const Voucher = require('../models/Voucher');

exports.listVouchers = async (req, res) => {
  try {
    const vouchers = await Voucher.find({ active: true, expiresAt: { $gt: new Date() } });
    return res.json({ success: true, data: vouchers, total: vouchers.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
