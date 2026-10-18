// Saves a signed-in user's city so it follows them across devices.
// API keys and webhook secrets are never stored: they stay on each device.

import { getUser } from '../../../lib/server/auth';
import { storeEnabled, getCity, putCity } from '../../../lib/server/store';
import { GRID } from '../../../lib/city';

export const runtime = 'nodejs';

const MAX_BYTES = 900_000;
const LOT = /^[0-4]-[0-4]$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

function clean(city) {
  if (!city || typeof city !== 'object' || typeof city.agents !== 'object' || Array.isArray(city.agents)) return null;
  const agents = {};
  const entries = Object.entries(city.agents);
  if (entries.length > GRID * GRID - 1) return null;
  for (const [lot, a] of entries) {
    if (!LOT.test(lot) || lot === '2-2' || !a || typeof a !== 'object') return null;
    const { apiKey, secret, ...conn } = a.connection || {};
    agents[lot] = {
      ...a,
      connection: conn,
      unread: 0,
      history: (Array.isArray(a.history) ? a.history : []).slice(-40).map(m => ({
        role: m.role, content: String(m.content || '').slice(0, 8000), ts: m.ts, ...(m.error ? { error: true } : {}),
        ...(Array.isArray(m.files) ? { files: m.files.map(f => ({ name: f.name, kind: f.kind, size: f.size })) } : {}),
      })),
    };
  }
  return { name: String(city.name || 'My City').slice(0, 40), version: 1, agents };
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return json({ error: 'Sign in to sync your city.' }, 401);
  if (!storeEnabled()) return json({ enabled: false });
  const rec = await getCity(user.id);
  return json({ enabled: true, city: rec?.city || null, updatedAt: rec?.updatedAt || 0 });
}

// PUT { city, baseUpdatedAt } -> { updatedAt } or 409 { city, updatedAt } if another device saved first.
export async function PUT(req) {
  const user = await getUser(req);
  if (!user) return json({ error: 'Sign in to sync your city.' }, 401);
  if (!storeEnabled()) return json({ enabled: false }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const city = clean(body.city);
  if (!city) return json({ error: 'That city data is not valid.' }, 400);
  if (JSON.stringify(city).length > MAX_BYTES) return json({ error: 'City is too large to sync. Try clearing some chat history.' }, 413);

  const current = await getCity(user.id);
  if (current && !body.force && Number(body.baseUpdatedAt || 0) < current.updatedAt) {
    return json({ conflict: true, city: current.city, updatedAt: current.updatedAt }, 409);
  }
  const updatedAt = Math.max(Date.now(), (current?.updatedAt || 0) + 1);
  await putCity(user.id, { city, updatedAt });
  return json({ updatedAt });
}
