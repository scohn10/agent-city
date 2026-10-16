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
