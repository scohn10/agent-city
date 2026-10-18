import crypto from 'node:crypto';
import { PAID_PLANS } from '../../../../lib/plans';
import { billingConfigured, stripe, prices, session, origin, json, publicError, currentPlan } from '../../../../lib/server/billing';
import { getUser, linkedCustomer, linkCustomer, userEmail } from '../../../../lib/server/auth';

export const runtime = 'nodejs';

const tag = () => Array.from(crypto.randomBytes(8), b => String.fromCharCode(97 + (b % 26))).join('');

// POST { plan: 'town' | 'city' } -> { url }  (Stripe Checkout, or the Customer Portal for plan changes)
export async function POST(req) {
  if (!billingConfigured()) return json({ error: 'Payments are not set up yet.' }, { status: 503 });
  const user = await getUser(req);
  if (!user) return json({ error: 'Sign in to subscribe.', signIn: true }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch {}
  const plan = body.plan;
  if (!PAID_PLANS.includes(plan)) return json({ error: 'Unknown plan' }, { status: 400 });

  const base = origin(req);
  try {
    const s = stripe();
    let cid = session(req, user)?.cid || await linkedCustomer(user);

    // Already paying: plan changes go through the Customer Portal (handles proration,
    // and nobody ends up with two subscriptions).
    if (cid && (await currentPlan(cid)) !== 'free') {
      const portal = await s.billingPortal.sessions.create({ customer: cid, return_url: `${base}/?billing=updated` });
      return json({ url: portal.url, portal: true });
    }

    if (!cid) {
      const customer = await s.customers.create({
        email: (await userEmail(user)) || undefined,
        metadata: { clerk_user_id: user.id },
      });
      cid = customer.id;
      await linkCustomer(user, cid);
    }

    const ids = await prices();
    const checkout = await s.checkout.sessions.create({
      mode: 'subscription',
      customer: cid,
      client_reference_id: user.id,
      line_items: [{ price: ids[plan], quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?checkout=cancel`,
      subscription_data: { metadata: { agentcity_plan: plan, clerk_user_id: user.id } },
      metadata: { agentcity_plan: plan, clerk_user_id: user.id },
      integration_identifier: `agentcity_plans_${tag()}`,
    });
    return json({ url: checkout.url });
  } catch (e) {
    return json({ error: publicError(e) }, { status: 502 });
  }
}
