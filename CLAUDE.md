# Agent City

Licensable spin-off of Operations City. Separate repo and Vercel project; never touch `scohn10/operations-city` from here.

- Standing build rule: build (`npm run build`) → check nothing secret is staged → commit with a descriptive message → push. No confirmation prompts; stop only on build failure or a staged credential.
- `lib/city.js` is client-safe config. All model calls go through `app/api/relay/route.js`. User API keys arrive per request and are never stored or logged server-side.
- The onboarding tour lives in `components/App.jsx` (Welcome, Coach, TourNote; steps welcome → plus → form → chat → station → finish → done, saved in localStorage under `agentcity:tour`).
- Billing: plans in `lib/plans.js` (client-safe), Stripe logic in `lib/server/billing.js` (server-only), routes in `app/api/billing/*`. Stripe is the source of truth (no DB); the webhook syncs `customer.metadata.agentcity_plan`. Never commit keys; `STRIPE_MOCK_URL` is for local tests only.
- Accounts: Clerk via `lib/server/auth.js` (+ `proxy.js`, conditional `ClerkProvider` in `app/layout.js`); city sync via `lib/server/store.js` (Upstash Redis) and `app/api/city`. API keys never leave the device. `AGENTCITY_TEST_AUTH` / in-memory store are for local tests only.
