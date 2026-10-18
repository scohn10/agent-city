// Server-only billing helpers. Never import this from a client component.
//
// Stripe is the source of truth for plans. Each customer's plan is mirrored onto
// customer.metadata.agentcity_plan by the webhook (and on checkout confirm). Accounts come from
// Clerk; the Stripe customer id lives in the user's Clerk private metadata. The browser carries a
// signed, httpOnly cookie { uid, cid, plan, chk } as an hourly cache, valid only for that user.

import crypto from 'node:crypto';
import Stripe from 'stripe';
import { PLANS, PAID_PLANS, PLAN_RANK } from '../plans';
import { getUser } from './auth';

const ENTITLED = new Set(['active', 'trialing', 'past_due']);
export const COOKIE = 'ac_plan';
const RECHECK_MS = 60 * 60 * 1000;           // re-verify plan with Stripe at most hourly
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;   // browser maximum

let client = null;

export function billingConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripe() {
  if (!billingConfigured()) throw new Error('Billing is not configured');
  if (!client) {
    const opts = { appInfo: { name: 'Agent City' }, maxNetworkRetries: 2 };
    // Test-only: point the SDK at a local fake Stripe. Ignored in production.
    const mock = process.env.STRIPE_MOCK_URL && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_STRIPE_MOCK === '1');
    if (mock) {
      const u = new URL(process.env.STRIPE_MOCK_URL);
      Object.assign(opts, { host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(':', '') });
    }
    client = new Stripe(process.env.STRIPE_SECRET_KEY, opts);
  }
  return client;
}

/* ---------- signing (cookie + restore links) ---------- */

function signingKey() {
  const base = process.env.ENTITLEMENT_SECRET || process.env.STRIPE_SECRET_KEY || '';
  return crypto.createHash('sha256').update(`agent-city-entitlement:${base}`).digest();
}

const b64u = buf => Buffer.from(buf).toString('base64url');

export function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = b64u(crypto.createHmac('sha256', signingKey()).update(body).digest());
  return `${body}.${mac}`;
}

export function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = b64u(crypto.createHmac('sha256', signingKey()).update(body).digest());
  const a = Buffer.from(mac || ''), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}

/* ---------- cookies ---------- */

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function planCookie({ uid, cid, plan }) {
  const value = sign({ uid, cid, plan, chk: Date.now() });
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// The cached plan from the cookie, only if it belongs to this user.
export function session(req, user) {
  const s = verify(readCookie(req));
  return s && user && s.uid === user.id && typeof s.cid === 'string' ? s : null;
}

export function sessionIsFresh(s) {
  return s && Date.now() - (s.chk || 0) < RECHECK_MS;
}

/* ---------- catalog ---------- */

let priceCache = null;

// Finds (or creates, first time) one Product per paid plan with a monthly Price,
// identified by lookup_key so nothing is hard-coded per Stripe account.
export async function prices() {
  if (priceCache) return priceCache;
  const s = stripe();
  const keys = PAID_PLANS.map(id => PLANS[id].lookupKey);
  const found = await s.prices.list({ lookup_keys: keys, active: true, limit: 10 });
  const byKey = Object.fromEntries(found.data.map(p => [p.lookup_key, p]));
  for (const id of PAID_PLANS) {
    const plan = PLANS[id];
    if (byKey[plan.lookupKey]) continue;
    const product = await s.products.create({
      name: `Agent City ${plan.name}`,
      description: `Up to ${plan.lots} agents in your city, plus voice mode and file attachments.`,
      metadata: { agentcity_plan: id },
    });
    byKey[plan.lookupKey] = await s.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: Math.round(plan.price * 100),
      recurring: { interval: 'month' },
      lookup_key: plan.lookupKey,
      metadata: { agentcity_plan: id },
    });
  }
  priceCache = Object.fromEntries(PAID_PLANS.map(id => [id, byKey[PLANS[id].lookupKey].id]));
  return priceCache;
}

function planForPrice(price) {
  if (!price) return null;
  if (price.metadata?.agentcity_plan && PLANS[price.metadata.agentcity_plan]) return price.metadata.agentcity_plan;
  return PAID_PLANS.find(id => PLANS[id].lookupKey === price.lookup_key) || null;
}

/* ---------- entitlement ---------- */

// Recomputes a customer's plan from their subscriptions and mirrors it onto the customer.
export async function syncCustomerPlan(customerId) {
  const s = stripe();
  const subs = await s.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  let plan = 'free';
  for (const sub of subs.data) {
    if (!ENTITLED.has(sub.status)) continue;
    for (const item of sub.items?.data || []) {
      const p = planForPrice(item.price);
      if (p && PLAN_RANK[p] > PLAN_RANK[plan]) plan = p;
    }
  }
  const customer = await s.customers.retrieve(customerId);
  if (!customer.deleted && customer.metadata?.agentcity_plan !== plan) {
    await s.customers.update(customerId, { metadata: { agentcity_plan: plan } });
  }
  return plan;
}

// Cheap hourly re-check: read the plan the webhook mirrored onto the customer.
export async function currentPlan(customerId) {
  const customer = await stripe().customers.retrieve(customerId);
  if (customer.deleted) return 'free';
  const p = customer.metadata?.agentcity_plan;
  return PLANS[p] ? p : syncCustomerPlan(customerId);
}

// Plan for a request, from the signed cookie (no Stripe call). Used to gate features server-side.
export async function requestPlan(req) {
  const user = await getUser(req);
  const s = session(req, user);
  return s && PLANS[s.plan] ? s.plan : 'free';
}

export function origin(req) {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/+$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

export function json(data, { status = 200, cookie } = {}) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (cookie) headers['set-cookie'] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}

export function publicError(e) {
  // Stripe errors can include request details; only surface a safe message.
  const msg = e?.type?.startsWith?.('Stripe') ? (e.message || 'Payment service error') : 'Something went wrong';
  return msg.replace(/(sk|rk)_(test|live)_[A-Za-z0-9]+/g, '[key]');
}
