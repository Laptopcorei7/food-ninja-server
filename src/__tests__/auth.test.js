const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const OTP = require('../models/OTP');

// Prevent actual SMS/email from being sent during tests
jest.mock('../utils/sendOTP', () => ({
  sendOTP: jest.fn().mockResolvedValue(),
}));

const BASE = '/api/v1/auth';

// ─── Helper ────────────────────────────────────────────────────────────────

async function createUser(overrides = {}) {
  const hashed = await bcrypt.hash('password123', 10);
  return User.create({
    name: 'Test User',
    email: 'test@example.com',
    password: hashed,
    ...overrides,
  });
}

async function createOTP(overrides = {}) {
  return OTP.create({
    contact: '+1234567890',
    code: '1234',
    purpose: 'verify_phone',
    expiresAt: new Date(Date.now() + 90 * 1000),
    used: false,
    ...overrides,
  });
}

// ─── POST /auth/otp/send (protected) ───────────────────────────────────────

describe('POST /auth/otp/send', () => {
  it('sends OTP and saves phone to user profile (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/otp/send`)
      .set('Authorization', `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`)
      .send({ phone: '+233501234567' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe('OTP sent to your phone');

    const updated = await User.findById(user._id);
    expect(updated.phoneNumber).toBe('+233501234567');

    const otp = await OTP.findOne({ contact: '+233501234567', purpose: 'verify_phone' });
    expect(otp).not.toBeNull();
    expect(otp.code).toHaveLength(4);
  });

  it('returns 400 when phone is missing', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/otp/send`)
      .set('Authorization', `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 for a local-format phone like 0241234567', async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`${BASE}/otp/send`)
      .set('Authorization', `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`)
      .send({ phone: '0241234567' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('phone must be in international format, e.g. +233241234567');
    expect(await OTP.findOne({ contact: '0241234567' })).toBeNull();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post(`${BASE}/otp/send`).send({ phone: '+233501234567' });
    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/otp/verify (protected) ─────────────────────────────────────

describe('POST /auth/otp/verify', () => {
  it('verifies a valid OTP and marks it as used (200)', async () => {
    const user = await createUser({ phoneNumber: '+233501234567' });
    await createOTP({ contact: '+233501234567', code: '9876', purpose: 'verify_phone' });

    const res = await request(app)
      .post(`${BASE}/otp/verify`)
      .set('Authorization', `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`)
      .send({ otp: '9876' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe('Phone verified successfully');

    const record = await OTP.findOne({ contact: '+233501234567' });
    expect(record.used).toBe(true);
    expect((await User.findById(user._id)).phoneVerified).toBe(true);
  });

  it('otp/send to a different number clears phoneVerified; the same number keeps it', async () => {
    const user = await createUser({ phoneNumber: '+233501234567', phoneVerified: true });
    const auth = `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`;

    await request(app).post(`${BASE}/otp/send`).set('Authorization', auth).send({ phone: '+233501234567' });
    expect((await User.findById(user._id)).phoneVerified).toBe(true);

    await request(app).post(`${BASE}/otp/send`).set('Authorization', auth).send({ phone: '+233509999999' });
    expect((await User.findById(user._id)).phoneVerified).toBe(false);
  });

  it('returns 400 for a wrong OTP code', async () => {
    const user = await createUser({ phoneNumber: '+233501234567' });
    await createOTP({ contact: '+233501234567', code: '9876', purpose: 'verify_phone' });

    const res = await request(app)
      .post(`${BASE}/otp/verify`)
      .set('Authorization', `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`)
      .send({ otp: '0000' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid OTP');
  });

  it('returns 410 for an expired OTP', async () => {
    const user = await createUser({ phoneNumber: '+233501234567' });
    await createOTP({
      contact: '+233501234567',
      code: '9876',
      purpose: 'verify_phone',
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app)
      .post(`${BASE}/otp/verify`)
      .set('Authorization', `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`)
      .send({ otp: '9876' });

    expect(res.status).toBe(410);
    expect(res.body.message).toBe('OTP expired');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post(`${BASE}/otp/verify`).send({ otp: '1234' });
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /auth/account ──────────────────────────────────────────────────

describe('DELETE /auth/account', () => {
  it('deletes the authenticated user\'s account (200)', async () => {
    const user = await createUser();
    const res = await request(app)
      .delete(`${BASE}/account`)
      .set('Authorization', `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Account deleted successfully');

    const deleted = await User.findById(user._id);
    expect(deleted).toBeNull();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).delete(`${BASE}/account`);
    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/signup (alias for /register) ───────────────────────────────

describe('POST /auth/signup', () => {
  it('is an alias for /register and returns a token (201)', async () => {
    const res = await request(app).post(`${BASE}/signup`).send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'secret123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('jane@example.com');
  });
});

// ─── POST /auth/register ────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('creates a user and returns a token (201)', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'secret123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('john@example.com');
  });

  it('does not include the password in the response', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'secret123',
    });

    expect(res.body.data.user.password).toBeUndefined();
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      email: 'john@example.com',
      password: 'secret123',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      name: 'John Doe',
      password: 'secret123',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      name: 'John Doe',
      email: 'john@example.com',
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 when email is already registered', async () => {
    await createUser({ email: 'john@example.com' });

    const res = await request(app).post(`${BASE}/register`).send({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'secret123',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

// ─── POST /auth/login ───────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await createUser();
  });

  it('returns a token and user on valid credentials (200)', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('does not include the password in the response', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(res.body.data.user.password).toBeUndefined();
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      email: 'test@example.com',
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 on wrong email', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      email: 'wrong@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app).post(`${BASE}/login`).send({
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ─── POST /auth/send-otp ────────────────────────────────────────────────────

describe('POST /auth/send-otp', () => {
  it('creates an OTP record and returns success (200)', async () => {
    const res = await request(app).post(`${BASE}/send-otp`).send({
      phoneNumber: '+1234567890',
      purpose: 'verify_phone',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const otp = await OTP.findOne({ contact: '+1234567890' });
    expect(otp).not.toBeNull();
    expect(otp.code).toHaveLength(4);
  });

  it('returns 400 when phoneNumber is missing', async () => {
    const res = await request(app).post(`${BASE}/send-otp`).send({
      purpose: 'verify_phone',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when purpose is missing', async () => {
    const res = await request(app).post(`${BASE}/send-otp`).send({
      phoneNumber: '+1234567890',
    });

    expect(res.status).toBe(400);
  });
});

// ─── POST /auth/verify-otp ──────────────────────────────────────────────────

describe('POST /auth/verify-otp', () => {
  it('verifies a valid OTP and marks it as used (200)', async () => {
    await createOTP();

    const res = await request(app).post(`${BASE}/verify-otp`).send({
      phoneNumber: '+1234567890',
      code: '1234',
      purpose: 'verify_phone',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const otp = await OTP.findOne({ contact: '+1234567890' });
    expect(otp.used).toBe(true);
  });

  it('returns 400 for an invalid code', async () => {
    await createOTP();

    const res = await request(app).post(`${BASE}/verify-otp`).send({
      phoneNumber: '+1234567890',
      code: '9999',
      purpose: 'verify_phone',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an expired OTP', async () => {
    await createOTP({ expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).post(`${BASE}/verify-otp`).send({
      phoneNumber: '+1234567890',
      code: '1234',
      purpose: 'verify_phone',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('OTP expired');
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post(`${BASE}/verify-otp`).send({
      phoneNumber: '+1234567890',
    });

    expect(res.status).toBe(400);
  });
});

// ─── POST /auth/forgot-password ─────────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
  it('creates a forgot_password OTP for an existing account (200)', async () => {
    await createUser({ phoneNumber: '+1234567890' });
    const res = await request(app).post(`${BASE}/forgot-password`).send({
      method: 'sms',
      contact: '+1234567890',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Reset code sent');

    const otp = await OTP.findOne({ contact: '+1234567890', purpose: 'forgot_password' });
    expect(otp).not.toBeNull();
  });

  it('matches email case-insensitively', async () => {
    await createUser();
    const res = await request(app).post(`${BASE}/forgot-password`).send({
      method: 'email',
      contact: 'Test@Example.com',
    });

    expect(res.status).toBe(200);
    const otp = await OTP.findOne({ contact: 'test@example.com', purpose: 'forgot_password' });
    expect(otp).not.toBeNull();
  });

  it('returns the same 200 but sends nothing when no account matches', async () => {
    const res = await request(app).post(`${BASE}/forgot-password`).send({
      method: 'sms',
      contact: '+1999999999',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Reset code sent');
    expect(await OTP.findOne({ contact: '+1999999999' })).toBeNull();
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post(`${BASE}/forgot-password`).send({
      method: 'sms',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown method', async () => {
    const res = await request(app).post(`${BASE}/forgot-password`).send({
      method: 'SMS',
      contact: '+1234567890',
    });

    expect(res.status).toBe(400);
  });
});

// ─── POST /auth/forgot-password/verify ─────────────────────────────────────

describe('POST /auth/forgot-password/verify', () => {
  beforeEach(async () => {
    await createUser({ phoneNumber: '+1234567890' });
  });

  it('returns a resetToken and marks the code used (200)', async () => {
    await createOTP({ purpose: 'forgot_password' });
    const res = await request(app).post(`${BASE}/forgot-password/verify`).send({
      contact: '+1234567890',
      code: '1234',
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.resetToken).toBe('string');

    const again = await request(app).post(`${BASE}/forgot-password/verify`).send({
      contact: '+1234567890',
      code: '1234',
    });
    expect(again.status).toBe(400);
  });

  it('issues a token that does not work as a login token', async () => {
    await createOTP({ purpose: 'forgot_password' });
    const res = await request(app).post(`${BASE}/forgot-password/verify`).send({
      contact: '+1234567890',
      code: '1234',
    });

    const me = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${res.body.data.resetToken}`);
    expect(me.status).toBe(401);
  });

  it('returns 400 for a wrong code', async () => {
    await createOTP({ purpose: 'forgot_password' });
    const res = await request(app).post(`${BASE}/forgot-password/verify`).send({
      contact: '+1234567890',
      code: '9999',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid code');
  });

  it('refuses even the right code after 5 wrong guesses', async () => {
    await createOTP({ purpose: 'forgot_password' });
    const guess = (code) =>
      request(app).post(`${BASE}/forgot-password/verify`).send({ contact: '+1234567890', code });

    await Promise.all(['0000', '0001', '0002', '0003', '0004'].map(guess));
    const res = await guess('1234');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid code');
  });

  it('returns 400 for an expired code', async () => {
    await createOTP({ purpose: 'forgot_password', expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).post(`${BASE}/forgot-password/verify`).send({
      contact: '+1234567890',
      code: '1234',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Code expired');
  });
});

// ─── POST /auth/reset-password ──────────────────────────────────────────────

describe('POST /auth/reset-password', () => {
  let resetToken;

  beforeEach(async () => {
    await createUser({ phoneNumber: '+1234567890' });
    await createOTP({ purpose: 'forgot_password' });
    const res = await request(app).post(`${BASE}/forgot-password/verify`).send({
      contact: '+1234567890',
      code: '1234',
    });
    resetToken = res.body.data.resetToken;
  });

  it('resets the password and allows login with the new password (200)', async () => {
    const res = await request(app).post(`${BASE}/reset-password`).send({
      resetToken,
      newPassword: 'newpassword456',
      confirmPassword: 'newpassword456',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const login = await request(app).post(`${BASE}/login`).send({
      email: 'test@example.com',
      password: 'newpassword456',
    });
    expect(login.status).toBe(200);
  });

  it('rejects the same resetToken a second time', async () => {
    const body = { resetToken, newPassword: 'newpassword456', confirmPassword: 'newpassword456' };
    await request(app).post(`${BASE}/reset-password`).send(body);
    const res = await request(app).post(`${BASE}/reset-password`).send(body);

    expect(res.status).toBe(400);
  });

  it('returns 400 when passwords do not match', async () => {
    const res = await request(app).post(`${BASE}/reset-password`).send({
      resetToken,
      newPassword: 'newpassword456',
      confirmPassword: 'differentpassword',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Passwords do not match');
  });

  it('returns 400 for a login token passed as resetToken', async () => {
    const user = await User.findOne({ email: 'test@example.com' });
    const res = await request(app).post(`${BASE}/reset-password`).send({
      resetToken: jwt.sign({ id: user._id }, process.env.JWT_SECRET),
      newPassword: 'newpassword456',
      confirmPassword: 'newpassword456',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post(`${BASE}/reset-password`).send({ resetToken });

    expect(res.status).toBe(400);
  });
});
