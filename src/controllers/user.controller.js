const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const MenuItem = require('../models/MenuItem');
const { isE164, E164_MESSAGE } = require('../utils/phone');
const { locationError } = require('../utils/location');
const { handleError } = require('../utils/handleError');

// Maps DB field names to Flutter's expected field names
function formatUser(user) {
  const obj = user.toJSON ? user.toJSON() : { ...user };
  const { phoneNumber, photoUrl, location, ...rest } = obj;
  return {
    ...rest,
    firstName: rest.firstName ?? null,
    lastName: rest.lastName ?? null,
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
    return handleError(res, err);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    if (phone !== undefined && !isE164(phone))
      return res.status(400).json({ success: false, message: E164_MESSAGE });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        firstName,
        lastName,
        phoneNumber: phone,
        ...(phone !== undefined && phone !== req.user.phoneNumber && { phoneVerified: false }),
      },
      { new: true }
    );
    return res.json({ success: true, data: { user: formatUser(user) } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: 'No file uploaded' });

    // Relative path: the app reaches the server at different addresses (emulator, hotspot, LAN)
    // and prefixes whichever one it is using.
    const photoUrl = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.user._id, { photoUrl }, { new: true });
    return res.json({ success: true, data: { photoUrl: user.photoUrl } });
  } catch (err) {
    return handleError(res, err);
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
    return handleError(res, err);
  }
};

// PUT and DELETE /users/me/favorites/:menuItemId. Both are idempotent and return the id list.
exports.addFavorite = async (req, res) => {
  try {
    if (!(await MenuItem.exists({ _id: req.params.menuItemId })))
      return res.status(404).json({ success: false, message: 'Menu item not found' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { favoriteMenuItems: req.params.menuItemId } },
      { new: true }
    );
    return res.json({ success: true, data: { favoriteMenuItems: user.favoriteMenuItems } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { favoriteMenuItems: req.params.menuItemId } },
      { new: true }
    );
    return res.json({ success: true, data: { favoriteMenuItems: user.favoriteMenuItems } });
  } catch (err) {
    return handleError(res, err);
  }
};

// ─── Saved delivery addresses ───

const MAX_LABEL = 40;
const labelError = (label) =>
  typeof label !== 'string' || !label.trim() || label.trim().length > MAX_LABEL
    ? `label is required (at most ${MAX_LABEL} characters)`
    : null;

exports.listAddresses = async (req, res) => {
  return res.json({ success: true, data: { addresses: req.user.addresses } });
};

exports.addAddress = async (req, res) => {
  try {
    const { label, address, latitude, longitude } = req.body;
    const error = labelError(label) || locationError({ address, latitude, longitude });
    if (error) return res.status(400).json({ success: false, message: error });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { addresses: { label: label.trim(), address: address.trim(), latitude, longitude } } },
      { new: true }
    );
    return res.status(201).json({ success: true, data: { address: user.addresses.at(-1) } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const { label, address, latitude, longitude } = req.body;
    const error = (label !== undefined && labelError(label)) || locationError({ address, latitude, longitude }, { partial: true });
    if (error) return res.status(400).json({ success: false, message: error });

    const fields = { label: label?.trim(), address: address?.trim(), latitude, longitude };
    const $set = {};
    for (const [key, value] of Object.entries(fields))
      if (value !== undefined) $set[`addresses.$.${key}`] = value;

    const user = await User.findOneAndUpdate(
      { _id: req.user._id, 'addresses._id': req.params.id },
      { $set },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'Address not found' });
    return res.json({ success: true, data: { address: user.addresses.id(req.params.id) } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.removeAddress = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, 'addresses._id': req.params.id },
      { $pull: { addresses: { _id: req.params.id } } },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'Address not found' });
    return res.json({ success: true, data: { addresses: user.addresses } });
  } catch (err) {
    return handleError(res, err);
  }
};

// ─── Payment methods ───
// Only type, brand or network, and last4 are stored: never a full card or MoMo number, never a CVV.

const BRANDS = ['visa', 'mastercard'];
const NETWORKS = ['mtn', 'telecel', 'airteltigo'];

function paymentDetailsError(type, { brand, last4, network }) {
  if (last4 !== undefined && !/^\d{4}$/.test(last4)) return 'last4 must be exactly 4 digits';
  if (brand !== undefined && (type !== 'card' || !BRANDS.includes(brand)))
    return 'brand must be visa or mastercard, on a card';
  if (network !== undefined && (type !== 'momo' || !NETWORKS.includes(network)))
    return 'network must be mtn, telecel or airteltigo, on mobile money';
  return null;
}

const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : v);

const formatPaymentMethod = (m) => ({
  _id: m._id,
  type: m.type,
  brand: m.brand ?? null,
  network: m.network ?? null,
  last4: m.last4 ?? null,
});

exports.listPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ userId: req.user._id });
    return res.json({ success: true, data: { paymentMethods: methods.map(formatPaymentMethod) } });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.addPaymentMethod = async (req, res) => {
  try {
    const { type, last4 } = req.body;
    const brand = lower(req.body.brand);
    const network = lower(req.body.network);
    if (!type)
      return res.status(400).json({ success: false, message: 'type is required' });
    const error = paymentDetailsError(type, { last4, brand, network });
    if (error) return res.status(400).json({ success: false, message: error });

    const method = await PaymentMethod.create({ userId: req.user._id, type, last4, brand, network });
    await User.findByIdAndUpdate(req.user._id, { $push: { paymentMethods: method._id } });

    return res.status(201).json({ success: true, data: { paymentMethod: formatPaymentMethod(method) } });
  } catch (err) {
    return handleError(res, err);
  }
};

// PATCH /users/me/payment-methods/:id { brand?, last4?, network? }: card details added at checkout.
exports.updatePaymentMethod = async (req, res) => {
  try {
    const method = await PaymentMethod.findOne({ _id: req.params.id, userId: req.user._id });
    if (!method)
      return res.status(404).json({ success: false, message: 'Payment method not found' });

    const { last4 } = req.body;
    const brand = lower(req.body.brand);
    const network = lower(req.body.network);
    const error = paymentDetailsError(method.type, { brand, last4, network });
    if (error) return res.status(400).json({ success: false, message: error });

    if (brand !== undefined) method.brand = brand;
    if (last4 !== undefined) method.last4 = last4;
    if (network !== undefined) method.network = network;
    await method.save();
    return res.json({ success: true, data: { paymentMethod: formatPaymentMethod(method) } });
  } catch (err) {
    return handleError(res, err);
  }
};
