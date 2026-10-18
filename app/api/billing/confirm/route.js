import { billingConfigured, stripe, syncCustomerPlan, planCookie, json, publicError } from '../../../../lib/server/billing';
import { getUser, linkedCustomer } from '../../../../lib/server/auth';

export const runtime = 'nodejs';

// POST { session_id } after returning from Checkout -> { plan, email }
// Fulfillment itself is done by the webhook; this refreshes the plan right away for the buyer.
export async function POST(req) {
  if (!billingConfigured()) return json({ error: 'Payments are not set up yet.' }, { status: 503 });
  const user = await getUser(req);
  if (!user) return json({ error: 'Sign in to finish setting up your plan.', signIn: true }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch {}
  const id = body.session_id;
  if (typeof id !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: 'Bad session' }, { status: 400 });
  try {
    const cs = await stripe().checkout.sessions.retrieve(id);
    const cid = typeof cs.customer === 'string' ? cs.customer : cs.customer?.id;
    // The checkout must belong to this account.
    if (!cid || cid !== (await linkedCustomer(user)) || (cs.client_reference_id && cs.client_reference_id !== user.id)) {
      return json({ error: 'That checkout belongs to a different account.' }, { status: 403 });
    }
    if (cs.mode !== 'subscription' || cs.status !== 'complete') {
      return json({ error: 'That checkout isn\'t finished yet.' }, { status: 409 });
    }
    const plan = await syncCustomerPlan(cid);
    return json({ plan, email: cs.customer_details?.email || null }, { cookie: planCookie({ uid: user.id, cid, plan }) });
  } catch (e) {
    return json({ error: publicError(e) }, { status: 502 });
  }
}
