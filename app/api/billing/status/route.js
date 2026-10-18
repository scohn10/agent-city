import { PLANS } from '../../../../lib/plans';
import { billingConfigured, session, sessionIsFresh, currentPlan, syncCustomerPlan, planCookie, clearCookie, json } from '../../../../lib/server/billing';
import { getUser, linkedCustomer } from '../../../../lib/server/auth';

export const runtime = 'nodejs';

// GET -> { plan, billing, subscribed, signedIn }
export async function GET(req) {
  const configured = billingConfigured();
  const user = await getUser(req);
  const base = { billing: configured, signedIn: !!user };
  if (!user || !configured) return json({ ...base, plan: 'free', subscribed: false });

  const force = new URL(req.url).searchParams.get('refresh') === '1';
  const s = session(req, user);
  if (!force && sessionIsFresh(s)) return json({ ...base, plan: PLANS[s.plan] ? s.plan : 'free', subscribed: true });

  try {
    const cid = s?.cid || await linkedCustomer(user);
    if (!cid) return json({ ...base, plan: 'free', subscribed: false }, { cookie: clearCookie() });
    // After the Customer Portal, read subscriptions directly instead of waiting for the webhook.
    const plan = force ? await syncCustomerPlan(cid) : await currentPlan(cid);
    return json({ ...base, plan, subscribed: true }, { cookie: planCookie({ uid: user.id, cid, plan }) });
  } catch {
    // Stripe or Clerk unreachable: keep the last known plan rather than locking people out.
    return json({ ...base, plan: s && PLANS[s.plan] ? s.plan : 'free', subscribed: !!s, stale: true });
  }
}
