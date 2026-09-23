const Voucher = require('../models/Voucher');
const { handleError } = require('../utils/handleError');

exports.listVouchers = async (req, res) => {
  try {
    const vouchers = await Voucher.find({ active: true, expiresAt: { $gt: new Date() } });
    return res.json({ success: true, data: vouchers, total: vouchers.length });
  } catch (err) {
    return handleError(res, err);
  }
};
