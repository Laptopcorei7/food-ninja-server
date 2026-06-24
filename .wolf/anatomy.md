# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-06-24T09:06:30.198Z
> Files: 65 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~13 tok)
- `API_CONTRACT.md` — Food Ninja — Backend API Contract (~2977 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `jest.config.js` — Jest test configuration (~50 tok)
- `package-lock.json` — npm lock file (~79364 tok)
- `package.json` — Node.js package manifest (~196 tok)
- `server.js` — Declares http (~110 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## src/

- `app.js` — Declares express (~448 tok)

## src/__tests__/

- `auth.test.js` — API routes: POST (25 endpoints) (~2660 tok)
- `chat.test.js` — API routes: GET, POST (8 endpoints) (~1920 tok)
- `menuItem.test.js` — API routes: GET (3 endpoints) (~603 tok)
- `notification.test.js` — API routes: PUT (3 endpoints) (~1090 tok)
- `order.test.js` — API routes: GET, PUT, DELETE, POST (10 endpoints) (~3321 tok)
- `payment.test.js` — API routes: PUT, DELETE (5 endpoints) (~1846 tok)
- `rating.test.js` — API routes: POST (13 endpoints) (~2042 tok)
- `restaurant.test.js` — API routes: GET (6 endpoints) (~1275 tok)
- `setup.js` — Declares mongoose (~194 tok)
- `shipping.test.js` — API routes: GET, PUT (6 endpoints) (~1138 tok)
- `user.test.js` — API routes: GET, PUT (12 endpoints) (~1393 tok)
- `voucher.test.js` — request: createUser, authHeader, futureDate, pastDate (~880 tok)

## src/config/

- `db.js` — mongoose: connectDB (~86 tok)

## src/controllers/

- `auth.controller.js` — Declares bcrypt (~1496 tok)
- `call.controller.js` — Voice calling via Agora RTC — not yet implemented. (~105 tok)
- `chat.controller.js` — Declares Chat (~549 tok)
- `menuItem.controller.js` — Declares MenuItem (~118 tok)
- `notification.controller.js` — Declares Notification (~256 tok)
- `order.controller.js` — Order: recalculate (~1539 tok)
- `payment.controller.js` — Declares PaymentMethod (~646 tok)
- `rating.controller.js` — Rating: updateAverageRating (~811 tok)
- `restaurant.controller.js` — Declares Restaurant (~477 tok)
- `shipping.controller.js` — Declares Order (~336 tok)
- `user.controller.js` — API routes: GET (1 endpoints) (~498 tok)
- `voucher.controller.js` — Declares Voucher (~106 tok)

## src/middleware/

- `auth.js` — Declares jwt (~247 tok)
- `upload.js` — Declares multer (~198 tok)

## src/models/

- `Chat.js` — Declares mongoose (~100 tok)
- `MenuItem.js` — Declares mongoose (~233 tok)
- `Message.js` — Declares mongoose (~115 tok)
- `Notification.js` — Declares mongoose (~135 tok)
- `Order.js` — Declares mongoose (~372 tok)
- `OTP.js` — Declares mongoose (~154 tok)
- `PaymentMethod.js` — Declares mongoose (~112 tok)
- `Rating.js` — Declares mongoose (~162 tok)
- `Restaurant.js` — Declares mongoose (~120 tok)
- `User.js` — Declares mongoose (~253 tok)
- `Voucher.js` — Declares mongoose (~106 tok)

## src/routes/

- `auth.routes.js` — API routes: POST (6 endpoints) (~127 tok)
- `call.routes.js` — API routes: POST (1 endpoints) (~72 tok)
- `chat.routes.js` — API routes: GET, POST (3 endpoints) (~100 tok)
- `menuItem.routes.js` — API routes: GET (1 endpoints) (~71 tok)
- `notification.routes.js` — API routes: GET, PUT (2 endpoints) (~88 tok)
- `order.routes.js` — API routes: GET, POST, PUT, DELETE (6 endpoints) (~150 tok)
- `payment.routes.js` — API routes: GET, POST, PUT, DELETE (4 endpoints) (~113 tok)
- `rating.routes.js` — API routes: POST (3 endpoints) (~100 tok)
- `restaurant.routes.js` — API routes: GET (3 endpoints) (~106 tok)
- `shipping.routes.js` — API routes: GET, PUT (2 endpoints) (~89 tok)
- `user.routes.js` — API routes: GET, PUT (4 endpoints) (~132 tok)
- `voucher.routes.js` — API routes: GET (1 endpoints) (~71 tok)

## src/socket/

- `index.js` — jwt: initSocket, getIO (~270 tok)

## src/utils/

- `generateOTP.js` — Declares generateOTP (~35 tok)
- `generateToken.js` — jwt: generateToken (~51 tok)
- `sendOTP.js` — twilio: sendOTP (~254 tok)

## uploads/

- `.gitkeep` (~0 tok)
