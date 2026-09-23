const twilio = require('twilio');
const nodemailer = require('nodemailer');

async function sendOTP(contact, code, method = 'sms') {
  // Dev testing: print the code instead of paying for an SMS or waiting on email. Never set in production.
  if (process.env.OTP_CONSOLE === 'true') {
    console.log(`[OTP] ${method} to ${contact}: ${code}`);
    return;
  }
  if (method === 'sms') {
    // Android SMS Retriever autofill: <=140 bytes, the code as the only 4-digit number, and the
    // app's 11-char hash on the last line. The hash differs between debug and release builds.
    // Keep the code before the hash: the app takes the first 4-digit match, and hashes can contain digits.
    const hash = process.env.SMS_APP_HASH;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `Your Food Ninja code is ${code}. It expires in 90 seconds.${hash ? `\n${hash}` : ''}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: contact,
    });
  } else {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"Food Ninja" <${process.env.EMAIL_USER}>`,
      to: contact,
      subject: 'Your Food Ninja verification code',
      text: `Your code is ${code}. It expires in 1 minute 30 seconds.`,
    });
  }
}

module.exports = { sendOTP };
