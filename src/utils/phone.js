// E.164: + then country code and number, 8-15 digits. Twilio rejects anything else.
const isE164 = (phone) => /^\+[1-9]\d{7,14}$/.test(phone);
const E164_MESSAGE = 'phone must be in international format, e.g. +233241234567';

module.exports = { isE164, E164_MESSAGE };
