# Food Ninja — Backend API Contract

> Hand this document to the backend Claude Code instance as its starting brief.
> The frontend is a Flutter mobile app. All responses should be JSON.

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (use Mongoose for ODM)
- **Auth:** JWT (JSON Web Tokens) — `jsonwebtoken` package
- **Password hashing:** bcrypt
- **File uploads:** multer (for profile photo)
- **OTP:** Generate a random 4-digit code, store in DB with expiry (1 min 30 sec), send via SMS (Twilio SMS) or email (Nodemailer)
- **Voice calling:** Agora RTC or Twilio Voice — flag if uncertain, do not skip
- **Environment:** dotenv for config (MONGO_URI, JWT_SECRET, TWILIO keys, etc.)

---

## Base URL

```
Development:  http://localhost:5000/api/v1
Production:   https://api.foodninja.com/api/v1
```

---

## Auth Strategy

- On login/register, return a JWT token
- Token expires in **7 days**
- All protected routes (marked 🔒) require the header:
  ```
  Authorization: Bearer <token>
  ```
- Return **401** if token is missing or invalid
- Return **403** if token is expired

---

## Standard Response Format

All responses follow this shape:

```json
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "message": "Human-readable error description"
}

// List responses
{
  "success": true,
  "data": [ ... ],
  "total": 42
}
```

---

## Data Models

### User
```js
{
  _id: ObjectId,
  firstName: String,
  lastName: String,
  name: String,             // display name from signup
  email: String,            // unique
  password: String,         // bcrypt hashed
  phoneNumber: String,
  photoUrl: String,         // uploaded profile photo URL
  location: {
    address: String,
    latitude: Number,
    longitude: Number
  },
  membershipTier: String,   // default: "Member Gold"
  voucherCount: Number,     // default: 0
  paymentMethods: [ObjectId],
  defaultPaymentMethod: ObjectId,
  createdAt: Date
}
```

### Restaurant
```js
{
  _id: ObjectId,
  name: String,
  photoUrl: String,
  distance: Number,         // in km
  rating: Number,           // e.g. 4.8
  description: String,
  tags: [String],           // e.g. ["Popular"]
  popularMenu: [ObjectId],  // refs to MenuItems
  createdAt: Date
}
```

### MenuItem
```js
{
  _id: ObjectId,
  restaurantId: ObjectId,
  name: String,
  price: Number,
  photoUrl: String,
  rating: Number,
  orderCount: Number,
  ingredients: [String],
  description: String,
  tags: [String],           // e.g. ["Popular"]
  testimonials: [
    {
      userId: ObjectId,
      userName: String,
      userPhotoUrl: String,
      date: Date,
      stars: Number,
      comment: String
    }
  ],
  createdAt: Date
}
```

### Order
```js
{
  _id: ObjectId,
  userId: ObjectId,
  restaurantId: ObjectId,
  items: [
    {
      menuItemId: ObjectId,
      name: String,
      photoUrl: String,
      restaurantName: String,
      qty: Number,
      price: Number
    }
  ],
  status: String,           // "pending" | "processing" | "delivered" | "cancelled"
  subTotal: Number,
  deliveryCharge: Number,
  discount: Number,
  total: Number,
  deliveryAddress: {
    address: String,
    latitude: Number,
    longitude: Number
  },
  orderLocation: {          // restaurant/pickup address
    address: String,
    latitude: Number,
    longitude: Number
  },
  paymentMethodId: ObjectId,
  voucherId: ObjectId,
  driverId: ObjectId,
  createdAt: Date
}
```

### PaymentMethod
```js
{
  _id: ObjectId,
  userId: ObjectId,
  type: String,             // "paypal" | "visa" | "payoneer"
  maskedNumber: String,     // e.g. "2121 6352 8465 ****"
  details: String,          // encrypted account/card reference
  createdAt: Date
}
```

### OTP
```js
{
  _id: ObjectId,
  contact: String,          // phone number or email
  code: String,             // 4-digit code
  purpose: String,          // "verify_phone" | "forgot_password"
  expiresAt: Date,          // createdAt + 90 seconds
  used: Boolean
}
```

### Notification
```js
{
  _id: ObjectId,
  userId: ObjectId,
  type: String,             // "order_taken" | "topup" | "order_cancelled"
  message: String,
  timestamp: Date,
  read: Boolean
}
```

### Chat / Message
```js
// Chat (conversation thread)
{
  _id: ObjectId,
  participants: [ObjectId], // [userId, driverId]
  lastMessage: String,
  lastMessageTime: Date,
  orderId: ObjectId
}

// Message
{
  _id: ObjectId,
  chatId: ObjectId,
  senderId: ObjectId,
  text: String,
  timestamp: Date
}
```

### Rating
```js
{
  _id: ObjectId,
  orderId: ObjectId,
  userId: ObjectId,
  targetId: ObjectId,       // driverId | menuItemId | restaurantId
  targetType: String,       // "driver" | "food" | "restaurant"
  stars: Number,            // 1–5
  feedback: String,
  createdAt: Date
}
```

### Voucher
```js
{
  _id: ObjectId,
  title: String,
  description: String,
  photoUrl: String,
  discountAmount: Number,
  expiresAt: Date,
  active: Boolean
}
```

---

## Endpoints

### AUTH — `/auth`

| Method | Endpoint | Body | Protected | Description |
|--------|----------|------|-----------|-------------|
| POST | `/auth/register` | `{ name, email, password }` | No | Register new user, return JWT |
| POST | `/auth/login` | `{ email, password }` | No | Login, return JWT + user object |
| POST | `/auth/send-otp` | `{ phoneNumber, purpose }` | No | Generate & send 4-digit OTP via SMS. purpose: `"verify_phone"` or `"forgot_password"` |
| POST | `/auth/verify-otp` | `{ phoneNumber, code, purpose }` | No | Verify OTP code. Mark as used on success |
| POST | `/auth/forgot-password` | `{ method: "sms"\|"email", contact }` | No | Send reset code to phone or email |
| POST | `/auth/reset-password` | `{ contact, code, newPassword, confirmPassword }` | No | Reset password after OTP verified |

---

### USER — `/users`

| Method | Endpoint | Body | Protected | Description |
|--------|----------|------|-----------|-------------|
| GET | `/users/me` | — | 🔒 | Get current user's full profile |
| PUT | `/users/profile` | `{ firstName, lastName, phoneNumber }` | 🔒 | Update bio (signup step 2) |
| PUT | `/users/photo` | `multipart/form-data` (field: `photo`) | 🔒 | Upload profile photo, return `photoUrl` |
| PUT | `/users/location` | `{ address, latitude, longitude }` | 🔒 | Save user's delivery location |

---

### PAYMENT METHODS — `/payments`

| Method | Endpoint | Body | Protected | Description |
|--------|----------|------|-----------|-------------|
| GET | `/payments` | — | 🔒 | List all saved payment methods for user |
| POST | `/payments` | `{ type, details }` | 🔒 | Add a new payment method |
| PUT | `/payments/:id/default` | — | 🔒 | Set as the active/default payment method |
| DELETE | `/payments/:id` | — | 🔒 | Remove a payment method |

---

### RESTAURANTS — `/restaurants`

| Method | Endpoint | Query Params | Protected | Description |
|--------|----------|--------------|-----------|-------------|
| GET | `/restaurants` | `?search=&lat=&lng=&limit=&page=` | 🔒 | List restaurants. Optionally filter by search term and sort by distance |
| GET | `/restaurants/:id` | — | 🔒 | Restaurant detail + first 5 popular menu items |
| GET | `/restaurants/:id/menu` | `?limit=&page=` | 🔒 | Full paginated menu for a restaurant |

---

### MENU ITEMS — `/menu-items`

| Method | Endpoint | Protected | Description |
|--------|----------|-----------|-------------|
| GET | `/menu-items/:id` | 🔒 | Full menu item detail including ingredients, rating, order count, and testimonials |

---

### ORDERS — `/orders`

| Method | Endpoint | Body | Protected | Description |
|--------|----------|------|-----------|-------------|
| GET | `/orders` | — | 🔒 | List current user's orders (history) |
| POST | `/orders` | `{ restaurantId, items: [{ menuItemId, qty }] }` | 🔒 | Create a new order (cart) — calculates subTotal automatically |
| GET | `/orders/:id` | — | 🔒 | Order detail with all items and pricing breakdown |
| PUT | `/orders/:id/items/:itemId` | `{ qty }` | 🔒 | Update quantity of an item in the order |
| DELETE | `/orders/:id/items/:itemId` | — | 🔒 | Remove an item from the order |
| POST | `/orders/:id/place` | `{ paymentMethodId, deliveryAddress, voucherId? }` | 🔒 | Confirm and place the order. Changes status to `"processing"` |

**Pricing logic (server-side):**
- `subTotal` = sum of (item.price × item.qty)
- `deliveryCharge` = fixed $10 (or configurable)
- `discount` = voucher discount amount (0 if no voucher)
- `total` = subTotal + deliveryCharge - discount

---

### SHIPPING — `/shipping`

| Method | Endpoint | Body | Protected | Description |
|--------|----------|------|-----------|-------------|
| GET | `/shipping/:orderId` | — | 🔒 | Get order pickup location + deliver-to address |
| PUT | `/shipping/:orderId` | `{ deliverTo: { address, latitude, longitude } }` | 🔒 | Update the delivery address |

---

### VOUCHERS — `/vouchers`

| Method | Endpoint | Protected | Description |
|--------|----------|-----------|-------------|
| GET | `/vouchers` | 🔒 | List all active voucher promos available to the user |

---

### RATINGS — `/ratings`

| Method | Endpoint | Body | Protected | Description |
|--------|----------|------|-----------|-------------|
| POST | `/ratings/driver` | `{ orderId, driverId, stars, feedback }` | 🔒 | Rate the delivery driver after order completes |
| POST | `/ratings/food` | `{ orderId, menuItemId, stars, feedback }` | 🔒 | Rate the food item |
| POST | `/ratings/restaurant` | `{ orderId, restaurantId, stars, feedback }` | 🔒 | Rate the restaurant |

---

### NOTIFICATIONS — `/notifications`

| Method | Endpoint | Protected | Description |
|--------|----------|-----------|-------------|
| GET | `/notifications` | 🔒 | List all notifications for the current user, newest first |
| PUT | `/notifications/:id/read` | 🔒 | Mark a notification as read |

---

### CHAT — `/chats`

| Method | Endpoint | Body | Protected | Description |
|--------|----------|------|-----------|-------------|
| GET | `/chats` | — | 🔒 | List all chat conversations for the user |
| GET | `/chats/:id/messages` | — | 🔒 | Get messages in a specific chat thread |
| POST | `/chats/:id/messages` | `{ text }` | 🔒 | Send a message in a chat thread |

---

### VOICE CALLING

> **Do not implement with REST endpoints.** Voice calling requires a real-time service.
> Use **Agora RTC SDK** (recommended) or **Twilio Voice**.
>
> The backend needs to:
> 1. Generate an Agora/Twilio token for a given channel/call
> 2. Expose one endpoint: `POST /calls/token` → `{ channelName, uid }` → returns `{ token }`
> 3. The Flutter app uses the token with the Agora/Twilio Flutter SDK directly
>
> Flag to the user if you need the Agora App ID — they will need to create a free account at agora.io.

---

## Error Codes to Return

| Code | When |
|------|------|
| 400 | Bad request / missing fields / validation error |
| 401 | No token or invalid token |
| 403 | Token expired |
| 404 | Resource not found |
| 409 | Conflict (e.g. email already registered) |
| 500 | Internal server error |

---

## Project Structure (suggested)

```
backend/
├── src/
│   ├── config/        # db connection, env
│   ├── models/        # Mongoose schemas
│   ├── routes/        # Express routers
│   ├── controllers/   # Route handler logic
│   ├── middleware/    # auth middleware (JWT verify)
│   ├── utils/         # OTP generator, token generator
│   └── app.js
├── .env
├── package.json
└── server.js
```

---

## First Thing to Build

Start with the auth flow in this order:
1. MongoDB connection + User model
2. `POST /auth/register` + `POST /auth/login` (with JWT)
3. Auth middleware (verify token)
4. `POST /auth/send-otp` + `POST /auth/verify-otp`
5. `PUT /users/profile` + `PUT /users/photo` + `PUT /users/location`
6. `POST /payments` + `GET /payments`

This unblocks the entire signup flow on the Flutter side.
