// Dev seed: a test account that has finished onboarding, plus the restaurant catalogue
// (restaurants, menu items, vouchers) from seed-data.js. Safe to re-run; it replaces both.
// Usage: npm run seed  (password comes from SEED_USER_PASSWORD in .env, so it stays out of git)
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const PaymentMethod = require('../src/models/PaymentMethod');
const Restaurant = require('../src/models/Restaurant');
const MenuItem = require('../src/models/MenuItem');
const Voucher = require('../src/models/Voucher');
const { IMAGES, RESTAURANTS, KUMASI_RESTAURANTS, VOUCHERS, portionsFor } = require('./seed-data');

// photoUrl + photoCredit for an image key; nothing for a dish with no photo (null key).
const photo = (key) => (key ? { photoUrl: IMAGES[key].url, photoCredit: { name: IMAGES[key].photographer, url: IMAGES[key].source } } : {});

const TEST_USER = {
  email: 'tester@foodninja.dev',
  password: process.env.SEED_USER_PASSWORD,
  phoneNumber: '+233200000000',
};

async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');
  if (!TEST_USER.password) throw new Error('Set SEED_USER_PASSWORD in .env');
  await connectDB();

  const old = await User.findOne({ email: TEST_USER.email });
  if (old) {
    await PaymentMethod.deleteMany({ userId: old._id });
    await old.deleteOne();
  }

  const user = await User.create({
    firstName: 'Test',
    lastName: 'Ninja',
    name: 'Test Ninja',
    email: TEST_USER.email,
    password: await bcrypt.hash(TEST_USER.password, 10),
    phoneNumber: TEST_USER.phoneNumber,
    phoneVerified: true,
    photoUrl: 'https://i.pravatar.cc/300?u=tester@foodninja.dev',
    location: { address: '4 Liberation Road, Accra', latitude: 5.6037, longitude: -0.187 },
  });

  const card = await PaymentMethod.create({ userId: user._id, type: 'card', brand: 'visa', last4: '4242' });
  const paypal = await PaymentMethod.create({ userId: user._id, type: 'paypal', brand: 'PayPal' });
  user.paymentMethods = [card._id, paypal._id];
  user.defaultPaymentMethod = card._id;
  await user.save();

  console.log(`Seeded ${TEST_USER.email} (password: SEED_USER_PASSWORD in .env)`);

  await seedCatalogue();
}

// Replaces every restaurant, menu item and voucher with the data in seed-data.js.
async function seedCatalogue() {
  await Promise.all([Restaurant.deleteMany({}), MenuItem.deleteMany({}), Voucher.deleteMany({})]);
  await Restaurant.init(); // 2dsphere index, needed by the distance filters

  let itemCount = 0;
  const restaurants = [...RESTAURANTS, ...KUMASI_RESTAURANTS];
  for (const r of restaurants) {
    const restaurant = await Restaurant.create({
      name: r.name,
      address: r.address,
      description: r.description,
      ...photo(r.cover),
      location: { type: 'Point', coordinates: [r.lng, r.lat] },
      deliveryTimeMins: r.deliveryTimeMins,
      rating: r.rating,
      categories: [...new Set(r.menu.map(([, category]) => category))],
    });

    const items = await MenuItem.insertMany(r.menu.map(([name, category, price, image, rating, orderCount, description]) => ({
      restaurantId: restaurant._id, name, category, price, ...photo(image), rating, orderCount, description,
      options: portionsFor(name),
    })));
    restaurant.popularMenu = items.sort((a, b) => b.orderCount - a.orderCount).slice(0, 5).map((i) => i._id);
    await restaurant.save();
    itemCount += items.length;
  }

  const day = 24 * 60 * 60 * 1000;
  await Voucher.init(); // unique index on code
  const restaurantIds = new Map((await Restaurant.find({}, 'name').lean()).map((r) => [r.name, r._id]));
  await Voucher.insertMany(VOUCHERS.map(({ image, daysValid, restaurant, ...v }) => {
    if (restaurant && !restaurantIds.has(restaurant)) throw new Error(`Voucher ${v.code}: no restaurant named ${restaurant}`);
    return {
      ...v, ...photo(image), expiresAt: new Date(Date.now() + daysValid * day),
      ...(restaurant && { restaurantId: restaurantIds.get(restaurant) }),
    };
  }));

  console.log(`Seeded ${restaurants.length} restaurants (${KUMASI_RESTAURANTS.length} in Kumasi), ${itemCount} menu items, ${VOUCHERS.length} vouchers`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
