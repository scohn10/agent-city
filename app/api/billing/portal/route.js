import { billingConfigured, stripe, session, origin, json, publicError } from '../../../../lib/server/billing';

export const runtime = 'nodejs';

// POST -> { url } for Stripe's Customer Portal (change plan, update card, cancel, invoices).
export async function POST(req) {
  if (!billingConfigured()) return json({ error: 'Payments are not set up yet.' }, { status: 503 });
  const s = session(req);
  if (!s) return json({ error: 'No subscription found on this device.' }, { status: 401 });
  try {
    const p = await stripe().billingPortal.sessions.create({ customer: s.cid, return_url: `${origin(req)}/?billing=updated` });
    return json({ url: p.url });
  } catch (e) {
    return json({ error: publicError(e) }, { status: 502 });
  }
}
