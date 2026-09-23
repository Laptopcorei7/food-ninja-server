const Notification = require('../models/Notification');
const { handleError } = require('../utils/handleError');

exports.listNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ timestamp: -1 });
    return res.json({ success: true, data: notifications, total: notifications.length });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.markRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification)
      return res.status(404).json({ success: false, message: 'Notification not found' });

    return res.json({ success: true, data: notification });
  } catch (err) {
    return handleError(res, err);
  }
};
