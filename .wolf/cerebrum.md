# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-06-22

## User Preferences

- Cloudinary / cloud storage is only for production. Use local disk (multer) during development.
- Driver app and Admin app are separate future projects. The current backend serves the consumer app only — do not add driver or admin models/routes to this repo.
- Socket.io: user is unfamiliar with it but open to using it when it improves UX. Include it when it clearly benefits the consumer (order tracking, chat).
- Agora / voice calling: stub endpoints (return 501) until the driver app is built. Do not skip or omit the stub.
- Personal/portfolio project — security patches are nice-to-have, not blocking. But do upgrade runtime deps when a fix is available.
- **Always write tests alongside new code.** Every controller, route, or feature gets a corresponding test file created at the same time — not after. Tests catch what code review misses.
- **Always explain what was created and why before or after doing it.** The user needs to understand each change so they can guide direction. Call out: what was built, what it does, and any decision that wasn't obvious.

## Key Learnings

- **Project:** food_ninja_server — Node.js/Express/MongoDB backend for a Flutter food delivery mobile app.
- **Project structure:** src/ lives directly in food_ninja_server/ (no nested backend/ folder). Entry point is server.js at the root.
- **OTP TTL:** OTP model uses a MongoDB TTL index (`expireAfterSeconds: 0` on `expiresAt` field) to auto-delete expired docs. No cron job needed.
- **Socket.io rooms:** Each connected user automatically joins a room named by their userId. Controllers emit `order:status` to `userId` room and `chat:message` to `chatId` room. Flutter client uses `socket_io_client` package.
- **Rating aggregation:** When food/restaurant is rated, the controller recalculates the average from all Rating docs and updates `MenuItem.rating` / `Restaurant.rating` directly.
- **Photo URLs:** multer saves to `uploads/` at project root. URL is built as `${req.protocol}://${req.get('host')}/uploads/${filename}` and stored in `photoUrl` field. Express serves the folder as static.
- **Order flow:** Order starts as "pending" (cart). `POST /orders/:id/place` changes it to "processing" and emits `order:status` socket event. Status enum: pending → processing → delivered | cancelled.
- **tar vulnerability:** 2 remaining high-severity vulns after npm install are both `tar` (path traversal), a build-time transitive dep of bcrypt via @mapbox/node-pre-gyp. Not a runtime risk. Cannot be auto-fixed without changing bcrypt.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-06-24] `PaymentMethod.type` has a strict enum: `['paypal', 'visa', 'payoneer']`. Using `'card'` fails validation. Always seed with `'visa'` in tests.
- [2026-06-24] `Order.deliveryAddress` and `Order.orderLocation` are embedded locationSchema objects `{ address, latitude, longitude }`, not plain strings. Passing a string to either field fails with a Mongoose cast error — even in `findOneAndUpdate` without `runValidators: true`, because Mongoose casts update values before sending the query.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
