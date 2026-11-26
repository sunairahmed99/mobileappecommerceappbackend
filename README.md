# E-Store backend

Express API, MongoDB Atlas, Cloudinary uploads and Socket.IO chat. Requires Node.js 22.

## Local development

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and configure the required services.
3. Run `npm run dev` (or `npm start`). The standalone server connects to MongoDB before listening.

## Deploy from GitHub to Vercel

Import `sunairahmed99/mobileappecommerceappbackend` into Vercel. This repository contains the backend directly, so use Root Directory `.` and Framework Preset **Other**. Node.js is pinned to 22.x. The committed `vercel.json` installs production dependencies and routes requests to `api/server.js`; no frontend build or output directory is required. Enable Fluid compute for WebSocket support.

In Vercel Settings > Environment Variables, add values for Production and Preview as appropriate. Keep credentials in Vercel; never commit `.env`.

| Variable | Purpose |
| --- | --- |
| `DATABASE` | MongoDB Atlas connection URI, including database name |
| `JWT_SECRET` | Strong production signing secret |
| `JWT_EXPIRE` | Token lifetime, e.g. `7d` |
| `ALLOWED_ORIGINS` | Exact browser frontend origins separated by commas; no trailing slash |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Media uploads; existing lowercase aliases are also supported |
| `GMAIL_USER`, `GMAIL_PASSWORD` | Account email and Gmail app password for OTP mail |
| `STRIPE_SECRET_KEY` | Stripe server key. Use a newly rotated test key for sandbox payments. Restricted keys need access to create and read PaymentIntents, and Checkout Sessions if using web checkout. |
| `STRIPE_PUBLISHABLE_KEY` | Publishable key from the same Stripe account and mode as the server key. The API returns it to the mobile app when starting a payment. |
| `STRIPE_CURRENCY` | Three-letter Stripe currency matching the store's order totals, for example `usd` for US dollars. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from the deployed webhook endpoint |
| `PAYMENT_RETURN_URL` | Public frontend profile URL, e.g. `https://your-frontend.example/profile` |
| `GEMINI_API_KEY` | Server-only Google Gemini API key for the public store assistant. Never put this in frontend `EXPO_PUBLIC_*` variables. |
| `GEMINI_MODEL` | Optional Gemini model name. Defaults to `gemini-3.5-flash-lite`. |

Guest and signed-in support chats save text messages and AI replies in MongoDB for the admin inbox. Guest history follows a randomly generated credential stored on the device or browser. Admins can reply to guests by text. A foreground admin dashboard handles incoming messages while available. Gemini handles the next incoming message when all admins go offline. If an admin becomes available during generation, the pending reply is cancelled.

The assistant replies in English and retrieves active public products, current deals, and public store and delivery settings at request time. Product matches include tappable Shop cards. Best sellers are ranked by units in delivered orders, excluding refunded and failed payments, and show active, in-stock listings.

Order status and details are read directly from the signed-in customer's own orders. Guests receive a sign-in prompt for order lookups. The backend handles those replies and excludes order lookups from Gemini conversation context. Add the Gemini key to the backend host's environment variables and redeploy.

`PORT` is only used locally. Vercel sets `VERCEL` and `NODE_ENV` automatically. Atlas must permit network access from the deployment and the database user must have the required permissions.

In the Stripe sandbox, set up a webhook at `https://YOUR-BACKEND.vercel.app/api/payment/webhook` for `payment_intent.succeeded`. For hosted web checkout, also select `checkout.session.completed` and `checkout.session.async_payment_succeeded` and set `PAYMENT_RETURN_URL`. Set the webhook's signing secret in `STRIPE_WEBHOOK_SECRET`, add the Stripe environment variables in the backend deployment, and redeploy.

After adding/changing environment variables, redeploy. Check:

- `GET /health`: process liveness, independent of MongoDB.
- `GET /health/ready`: returns 200 only after MongoDB connects; returns 503 on configuration/database failure.
- `GET /api/products`: public API smoke check.
- An authenticated login and OTP flow using a test account.

Set the mobile frontend's `EXPO_PUBLIC_API_URL=https://YOUR-BACKEND.vercel.app` and rebuild it. Do not include `/api` in this value; the frontend adds route prefixes itself. The frontend Socket.IO client must use `transports: ['websocket']`, the default `/socket.io` path, and authenticate/re-register after reconnection.

## Hosting limits

Vercel supports WebSocket connections with Fluid compute. Connections can close at the function duration limit, and the app reconnects and reloads customer chat history. Use a single persistent Socket.IO backend instance for reliable live handoff. Scaling to multiple instances requires shared rooms, presence, and assistant cancellation. Chat history remains database-backed.

Vercel Functions impose a 4.5 MB request/response body limit. Existing upload routes accept larger files locally, so files above the platform limit need direct signed Cloudinary uploads before they can work on Vercel. In-memory application rate limits are per instance; use Vercel Firewall rules or a shared store for global limits.

## Verification

`npm test` runs isolated tests with mocked models/services. It does not establish that Atlas, email, Stripe, Google OAuth or push credentials are working. Verify those against the deployed environment before treating the app as production-ready.
