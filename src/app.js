const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const paymentRoutes = require('./routes/payment.routes');
const restaurantRoutes = require('./routes/restaurant.routes');
const menuItemRoutes = require('./routes/menuItem.routes');
const orderRoutes = require('./routes/order.routes');
const shippingRoutes = require('./routes/shipping.routes');
const voucherRoutes = require('./routes/voucher.routes');
const ratingRoutes = require('./routes/rating.routes');
const notificationRoutes = require('./routes/notification.routes');
const chatRoutes = require('./routes/chat.routes');
const callRoutes = require('./routes/call.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/restaurants', restaurantRoutes);
app.use('/api/v1/menu-items', menuItemRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/shipping', shippingRoutes);
app.use('/api/v1/vouchers', voucherRoutes);
app.use('/api/v1/ratings', ratingRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/calls', callRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

module.exports = app;
