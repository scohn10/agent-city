// Server-only: who is signed in. Clerk in production; a cookie-based stand-in for local tests.

import { auth, clerkClient } from '@clerk/nextjs/server';

export function clerkEnabled() {
  return !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

// Local tests only (never on unless explicitly allowed): `test_user=<id>` cookie acts as the login.
function testAuthOn() {
  return process.env.AGENTCITY_TEST_AUTH === '1' && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_AUTH === '1');
}

export function authEnabled() {
  return clerkEnabled() || testAuthOn();
}

function cookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const testLinks = new Map(); // userId -> stripe customer id (tests only)

// { id } for the signed-in user, or null.
export async function getUser(req) {
  if (testAuthOn() && !clerkEnabled()) {
    const id = cookie(req, 'test_user');
    return id && /^[\w-]{1,64}$/.test(id) ? { id, test: true } : null;
  }
  if (!clerkEnabled()) return null;
  try {
    const { userId } = await auth();
    return userId ? { id: userId } : null;
  } catch {
    return null;
  }
}

export async function userEmail(user) {
  if (user.test) return `${user.id}@test.local`;
  const client = await clerkClient();
  const u = await client.users.getUser(user.id);
  return u.primaryEmailAddress?.emailAddress || u.emailAddresses?.[0]?.emailAddress || null;
}

// The Stripe customer linked to this account (kept in Clerk private metadata), or null.
export async function linkedCustomer(user) {
  if (user.test) return testLinks.get(user.id) || null;
  const client = await clerkClient();
  const u = await client.users.getUser(user.id);
  const cid = u.privateMetadata?.stripeCustomerId;
  return typeof cid === 'string' ? cid : null;
}

export async function linkCustomer(user, cid) {
  if (user.test) { testLinks.set(user.id, cid); return; }
  const client = await clerkClient();
  await client.users.updateUserMetadata(user.id, { privateMetadata: { stripeCustomerId: cid } });
}
