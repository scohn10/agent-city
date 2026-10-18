import crypto from 'node:crypto';
import { PAID_PLANS } from '../../../../lib/plans';
import { billingConfigured, stripe, prices, session, origin, json, publicError } from '../../../../lib/server/billing';

export const runtime = 'nodejs';

const tag = () => Array.from(crypto.randomBytes(8), b => String.fromCharCode(97 + (b % 26))).join('');

// POST { plan: 'town' | 'city' } -> { url }  (Stripe Checkout, or the Customer Portal for plan changes)
export async function POST(req) {
  if (!billingConfigured()) return json({ error: 'Payments are not set up yet.' }, { status: 503 });
  let body = {};
  try { body = await req.json(); } catch {}
  const plan = body.plan;
  if (!PAID_PLANS.includes(plan)) return json({ error: 'Unknown plan' }, { status: 400 });

  const base = origin(req);
  try {
    const s = session(req);
    // Already a customer with a plan: switching plans happens in the Customer Portal,
    // which handles proration, so nobody ends up with two subscriptions.
    if (s?.plan && s.plan !== 'free') {
      const portal = await stripe().billingPortal.sessions.create({ customer: s.cid, return_url: `${base}/?billing=updated` });
      return json({ url: portal.url, portal: true });
    }
    const ids = await prices();
    const checkout = await stripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: ids[plan], quantity: 1 }],
      ...(s?.cid ? { customer: s.cid } : {}),
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?checkout=cancel`,
      subscription_data: { metadata: { agentcity_plan: plan } },
      metadata: { agentcity_plan: plan },
      integration_identifier: `agentcity_plans_${tag()}`,
    });
    return json({ url: checkout.url });
  } catch (e) {
    return json({ error: publicError(e) }, { status: 502 });
  }
}
