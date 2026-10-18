import { billingConfigured, stripe, syncCustomerPlan, planCookie, sign, json, publicError } from '../../../../lib/server/billing';

export const runtime = 'nodejs';

// POST { session_id } after returning from Checkout -> { plan, restore }
// Fulfillment itself is done by the webhook; this just links this browser to the customer.
export async function POST(req) {
  if (!billingConfigured()) return json({ error: 'Payments are not set up yet.' }, { status: 503 });
  let body = {};
  try { body = await req.json(); } catch {}
  const id = body.session_id;
  if (typeof id !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: 'Bad session' }, { status: 400 });
  try {
    const cs = await stripe().checkout.sessions.retrieve(id);
    if (cs.mode !== 'subscription' || cs.status !== 'complete' || !cs.customer) {
      return json({ error: 'That checkout isn\'t finished yet.' }, { status: 409 });
    }
    const cid = typeof cs.customer === 'string' ? cs.customer : cs.customer.id;
    const plan = await syncCustomerPlan(cid);
    const restore = sign({ cid, kind: 'restore' });
    return json({ plan, restore, email: cs.customer_details?.email || null }, { cookie: planCookie({ cid, plan }) });
  } catch (e) {
    return json({ error: publicError(e) }, { status: 502 });
  }
}
