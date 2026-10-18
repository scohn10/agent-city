# Agent City

A licensable spin-off of Operations City. Every user starts with a 5x5 isometric city:
Central Station in the middle, 24 parks around it. Tap a **+** on any park to build an agent
and connect it to their own AI:

- **Claude** — their Anthropic API key + model
- **OpenAI-compatible** — any `/chat/completions` endpoint (OpenAI, OpenRouter, Groq…)
- **Demo agent** — sample replies, no key, so anyone can try the city first
- **Webhook** — their own agent (Claude Agent SDK, n8n, Zapier, custom). We POST
  `{ agent, message, history, attachments }` and show `{ "reply": "..." }` or plain text.

Central Station lists every agent and can ask all of them a question at once.

Every chat supports:
- **Attachments** — images (shrunk to 1600px JPEG), PDFs, and text/CSV/JSON files; up to 4 per
  message and ~3 MB total. Claude gets native image/document blocks, OpenAI-compatible models get
  `image_url`/`file` parts, webhooks get an `attachments` array. Text files are inlined for all.
  Only file names and a small image preview are kept in chat history.
- **Speech to text** — mic button (browser Web Speech API; Chrome, Edge, Safari).
- **Voice** — "Listen" on any reply, a per-agent voice picker, and **Voice mode**: speak, the agent
  answers out loud, then it listens again.

New users get a guided tour: a welcome screen (name your city), then four coached steps:
build an agent on a spotlighted park, set it up (a no-key **Demo agent** is preselected),
send a first task from suggested prompts, and open Central Station. The **Tour** button in
the header restarts it.

## Plans & billing (Stripe)

| Plan | Price | Agents | Voice mode + file attachments |
|---|---|---|---|
| Village | Free | 2 | — |
| Town | $2.99/mo | 8 | ✓ |
| City | $5.99/mo | 24 | ✓ |

Accounts are **Clerk** (email code + Google). Stripe is the source of truth for plans: the webhook
mirrors each customer's plan onto `customer.metadata.agentcity_plan`, and the Stripe customer id is
kept in the user's Clerk private metadata. A signed httpOnly cookie `{uid, cid, plan}` caches the plan
for an hour and only counts for the signed-in user it was issued to. Products and monthly prices
are created automatically on first checkout (lookup keys `agentcity_town_monthly`,
`agentcity_city_monthly`). Without `STRIPE_SECRET_KEY` everything is unlocked; without Clerk keys
the app runs signed-out only.

**City sync:** signed-in users' cities are saved to **Upstash Redis** (`/api/city`) and follow them
across devices (last write wins, with a "which city?" choice the first time a device with its own city
signs in). API keys and webhook secrets are never synced; each device keeps its own.

Setup:
1. **Clerk** — Vercel → agent-city → Integrations → add **Clerk** (sets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   and `CLERK_SECRET_KEY`). In Clerk, turn on **Email verification code** and **Google**.
   Clerk's development instance works on `*.vercel.app`; a production instance needs your own domain.
2. **Upstash Redis** — Vercel → agent-city → Storage → create an **Upstash for Redis** database and
   connect it (sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`).

Stripe (test mode first):
3. Stripe → Developers → API keys → **Create restricted key** with: Checkout Sessions *Write*,
   Customers *Write*, Subscriptions *Read*, Products *Write*, Prices *Write*,
   Customer portal *Write*. Add it to Vercel as `STRIPE_SECRET_KEY` (mark it Sensitive).
4. Stripe → Developers → Webhooks → **Add endpoint** `https://<domain>/api/billing/webhook` with
   events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.created|updated|deleted|paused|resumed`, `invoice.paid`,
   `invoice.payment_failed`. Add its signing secret to Vercel as `STRIPE_WEBHOOK_SECRET` (Sensitive).
5. Stripe → Settings → Billing → **Customer portal**: activate it and allow switching between the
   Town and City products, cancelling, and updating payment methods.
6. Optional: `APP_URL` (e.g. your custom domain) and `ENTITLEMENT_SECRET` (signs the plan cookie;
   defaults to a value derived from the Stripe key).
7. Redeploy. Test with card `4242 4242 4242 4242`, then repeat steps 3–5 in live mode.

Lot limits and voice mode are enforced in the browser; file attachments are also enforced
server-side in `/api/relay`.

## Run / deploy

```bash
npm install
npm run dev            # http://localhost:3000
npx vercel --prod      # first run creates the Vercel project "agent-city"
```

No environment variables are needed: users bring their own keys.

## How it's built

- `lib/city.js` — client-safe config (grid, building styles, colors, providers)
- `components/CityMap.jsx` — isometric SVG renderer (parks, buildings, Central Station)
- `components/App.jsx` — state, add/edit agent flow, chat, Central Station
- `app/api/relay/route.js` — server relay to the user's provider; keys arrive per request
  and are never stored or logged; webhooks must be public https URLs

## Current limits (v0.1)

- City layout, keys and chat history live in the user's browser (localStorage), so a city
  doesn't follow a user across devices yet. Export/import layout is in Central Station.
- No accounts or billing yet. Licensing needs: sign-in, server-side city storage with
  encrypted keys, Stripe subscriptions, scheduled agent runs.
