const twilio = require('twilio');
const nodemailer = require('nodemailer');

async function sendOTP(contact, code, method = 'sms') {
  if (method === 'sms') {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `Your Food Ninja code is ${code}. It expires in 1 minute 30 seconds.`,
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
