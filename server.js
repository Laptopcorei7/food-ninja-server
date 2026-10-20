require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initSocket } = require('./src/socket');

const { devOTPCode } = require('./src/utils/generateOTP');

const PORT = process.env.PORT || 5000;

if (process.env.OTP_DEV_CODE && !devOTPCode()) {
  console.warn(process.env.NODE_ENV === 'production'
    ? '[OTP] OTP_DEV_CODE ignored: not allowed when NODE_ENV=production'
    : '[OTP] OTP_DEV_CODE ignored: it must be exactly 4 digits');
} else if (devOTPCode()) {
  console.warn(`[OTP] OTP_DEV_CODE is on: every code is ${devOTPCode()} and nothing is sent`);
}

connectDB();

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
