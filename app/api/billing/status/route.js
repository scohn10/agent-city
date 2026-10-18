import { PLANS } from '../../../../lib/plans';
import { billingConfigured, session, sessionIsFresh, currentPlan, syncCustomerPlan, planCookie, clearCookie, json } from '../../../../lib/server/billing';

export const runtime = 'nodejs';

// GET -> { plan, billing, subscribed }
export async function GET(req) {
  const configured = billingConfigured();
  const s = session(req);
  if (!s) return json({ plan: 'free', billing: configured, subscribed: false });
  if (!configured) return json({ plan: 'free', billing: false, subscribed: false }, { cookie: clearCookie() });
  const force = new URL(req.url).searchParams.get('refresh') === '1';
  if (!force && sessionIsFresh(s)) return json({ plan: PLANS[s.plan] ? s.plan : 'free', billing: true, subscribed: true });
  try {
    // After the Customer Portal, read subscriptions directly instead of waiting for the webhook.
    const plan = force ? await syncCustomerPlan(s.cid) : await currentPlan(s.cid);
    return json({ plan, billing: true, subscribed: true }, { cookie: planCookie({ cid: s.cid, plan }) });
  } catch {
    // Stripe unreachable: keep the last known plan rather than locking people out.
    return json({ plan: PLANS[s.plan] ? s.plan : 'free', billing: true, subscribed: true, stale: true });
  }
}
