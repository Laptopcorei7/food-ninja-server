const MenuItem = require('../models/MenuItem');
const { handleError } = require('../utils/handleError');

exports.getMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item)
      return res.status(404).json({ success: false, message: 'Menu item not found' });

    return res.json({ success: true, data: item });
  } catch (err) {
    return handleError(res, err);
  }
};
