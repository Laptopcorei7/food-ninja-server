const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');

// Maps DB field names to Flutter's expected field names
function formatUser(user) {
  const obj = user.toJSON ? user.toJSON() : { ...user };
  const { phoneNumber, photoUrl, location, ...rest } = obj;
  return {
    ...rest,
    phone: phoneNumber ?? null,
    photo: photoUrl ?? null,
    location: location
      ? { address: location.address ?? null, lat: location.latitude ?? null, lng: location.longitude ?? null }
      : null,
  };
}

exports.getMe = async (req, res) => {
  try {
    return res.json({ success: true, data: { user: formatUser(req.user) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, phoneNumber: phone },
      { new: true }
    );
    return res.json({ success: true, data: { user: formatUser(user) } });
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
    const { address, lat, lng } = req.body;
    if (!address || lat == null || lng == null)
      return res.status(400).json({ success: false, message: 'address, lat, and lng are required' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { location: { address, latitude: lat, longitude: lng } },
      { new: true }
    );
    return res.json({ success: true, data: { user: formatUser(user) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.listPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ userId: req.user._id });
    const formatted = methods.map(m => ({
      _id: m._id,
      type: m.type,
      last4: m.last4 ?? null,
      brand: m.brand ?? null,
    }));
    return res.json({ success: true, data: { paymentMethods: formatted } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.addPaymentMethod = async (req, res) => {
  try {
    const { type, last4, brand } = req.body;
    if (!type)
      return res.status(400).json({ success: false, message: 'type is required' });

    const method = await PaymentMethod.create({ userId: req.user._id, type, last4, brand });
    await User.findByIdAndUpdate(req.user._id, { $push: { paymentMethods: method._id } });

    return res.status(201).json({
      success: true,
      data: { paymentMethod: { _id: method._id, type: method.type, last4: method.last4 ?? null } },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
