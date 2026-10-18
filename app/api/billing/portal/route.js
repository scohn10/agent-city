import { billingConfigured, stripe, session, origin, json, publicError } from '../../../../lib/server/billing';
import { getUser, linkedCustomer } from '../../../../lib/server/auth';

export const runtime = 'nodejs';

// POST -> { url } for Stripe's Customer Portal (change plan, update card, cancel, invoices).
export async function POST(req) {
  if (!billingConfigured()) return json({ error: 'Payments are not set up yet.' }, { status: 503 });
  const user = await getUser(req);
  if (!user) return json({ error: 'Sign in to manage billing.', signIn: true }, { status: 401 });
  try {
    const cid = session(req, user)?.cid || await linkedCustomer(user);
    if (!cid) return json({ error: 'No subscription on this account yet.' }, { status: 404 });
    const p = await stripe().billingPortal.sessions.create({ customer: cid, return_url: `${origin(req)}/?billing=updated` });
    return json({ url: p.url });
  } catch (e) {
    return json({ error: publicError(e) }, { status: 502 });
  }
}
