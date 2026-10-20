const nodemailer = require('nodemailer');
const { devOTPCode } = require('./generateOTP');

// Arkesel SMS v2 (spec: developers.arkesel.com/spec/api_spec.v2.4.0.yaml). Plain send, not its OTP API:
// we generate and check codes ourselves and need our own message text for Android autofill.
async function sendViaArkesel(to, body) {
  const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
    method: 'POST',
    headers: { 'api-key': process.env.ARKESEL_API_KEY, 'Content-Type': 'application/json' },
    // Arkesel wants digits only (233...), our numbers are E.164 (+233...).
    body: JSON.stringify({ sender: process.env.SMS_SENDER_ID, message: body, recipients: [to.replace(/^\+/, '')] }),
  });
  const json = await res.json().catch(() => ({}));
  // A 200 can still drop the number under "invalid numbers" inside data, so require a delivered entry.
  const sent = Array.isArray(json.data) && json.data.some((d) => d.id);
  if (!res.ok || json.status !== 'success' || !sent) {
    throw new Error(`Arkesel send failed (HTTP ${res.status}): ${JSON.stringify(json)}`);
  }
}

async function sendViaTwilio(to, body) {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to });
}

const smsProviders = { arkesel: sendViaArkesel, twilio: sendViaTwilio };

async function sendOTP(contact, code, method = 'sms') {
  // Fixed dev code: the user already knows it, so nothing goes out.
  if (devOTPCode()) {
    console.log(`[OTP] dev code used for ${contact}`);
    return;
  }
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
    const body = `Your YumQuick code is ${code}. It expires in 90 seconds.${hash ? `\n${hash}` : ''}`;
    const provider = process.env.SMS_PROVIDER || 'arkesel';
    const send = smsProviders[provider];
    if (!send) throw new Error(`Unknown SMS_PROVIDER "${provider}"`);
    await send(contact, body);
  } else {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"YumQuick" <${process.env.EMAIL_USER}>`,
      to: contact,
      subject: 'Your YumQuick verification code',
      text: `Your code is ${code}. It expires in 1 minute 30 seconds.`,
    });
  }
}

module.exports = { sendOTP };
