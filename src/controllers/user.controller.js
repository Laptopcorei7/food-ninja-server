const User = require('../models/User');

exports.getMe = async (req, res) => {
  try {
    return res.json({ success: true, data: req.user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, phoneNumber },
      { new: true }
    );
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: 'No file uploaded' });

    const photoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.user._id, { photoUrl }, { new: true });
    return res.json({ success: true, data: { photoUrl: user.photoUrl } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { address, latitude, longitude } = req.body;
    if (!address || latitude == null || longitude == null)
      return res.status(400).json({ success: false, message: 'address, latitude, and longitude are required' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { location: { address, latitude, longitude } },
      { new: true }
    );
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
