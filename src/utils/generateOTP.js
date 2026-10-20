// OTP_DEV_CODE: one fixed 4-digit code for every OTP, dev only. Ignored in production
// (codes must never be guessable there) and when it is not exactly 4 digits.
function devOTPCode() {
  const code = process.env.OTP_DEV_CODE;
  if (!code || process.env.NODE_ENV === 'production' || !/^\d{4}$/.test(code)) return null;
  return code;
}

function generateOTP() {
  return devOTPCode() || String(Math.floor(1000 + Math.random() * 9000));
}

module.exports = { generateOTP, devOTPCode };
