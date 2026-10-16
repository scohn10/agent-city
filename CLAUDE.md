# Agent City

Licensable spin-off of Operations City. Separate repo and Vercel project; never touch `scohn10/operations-city` from here.

- Standing build rule: build (`npm run build`) → check nothing secret is staged → commit with a descriptive message → push. No confirmation prompts; stop only on build failure or a staged credential.
- `lib/city.js` is client-safe config. All model calls go through `app/api/relay/route.js`. User API keys arrive per request and are never stored or logged server-side.
- The onboarding tour lives in `components/App.jsx` (Welcome, Coach, TourNote; steps welcome → plus → form → chat → station → finish → done, saved in localStorage under `agentcity:tour`).
