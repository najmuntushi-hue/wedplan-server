# WedPlan Server

Express.js REST API for the WedPlan wedding planning platform.

## Live API

- API: https://YOUR-SERVER-URL
- Client repo: https://github.com/najmuntushi-hue/wedplan-client
- Server repo: https://github.com/najmuntushi-hue/wedplan-server

## Important Features

- JWT verification (Better Auth JWKS) with DB re-check of role and blocked status
- Role middleware for admin, vendor and customer on every protected route
- Services API with search, category/location filter and price sorting
- Vendor service CRUD with ownership checks and free-plan limit (3 active)
- Booking APIs with duplicate prevention and pending-only status changes
- Stripe Checkout session and signature-verified webhook (Premium activates only from webhook)
- Admin APIs for users, services and read-only transactions
- ImgBB image upload proxy (API key stays on the server)
- Zod request validation, proper 401/403 responses, global error handler

## Technology Stack

Node.js, Express.js, TypeScript, MongoDB, jose, Zod, Stripe, Multer

## Installation

```bash
git clone https://github.com/najmuntushi-hue/wedplan-server.git
cd wedplan-server
npm install
```

## Run Locally

1. Copy `.env.example` to `.env` and fill in the values.
2. Run:

```bash
npm run dev
```

3. For webhooks locally:

```bash
stripe listen --events checkout.session.completed,checkout.session.expired,invoice.paid,customer.subscription.deleted --forward-to localhost:5000/payments/webhook
```

4. Create an admin: sign up on the client, set `ADMIN_EMAIL` in `.env`, then:

```bash
npm run seed:admin
```

## Environment Variables

```env
PORT=5000
MONGODB_URI=
CLIENT_URL=
JWKS_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
IMGBB_API_KEY=
ADMIN_EMAIL=
```

## Required Application URLs

| Purpose | Local | Production |
|---|---|---|
| Client (CORS) | http://localhost:3000 | https://YOUR-CLIENT.vercel.app |
| JWKS_URL | http://localhost:3000/api/auth/jwks | https://YOUR-CLIENT.vercel.app/api/auth/jwks |
| Stripe webhook | localhost:5000/payments/webhook | https://YOUR-SERVER-URL/payments/webhook |