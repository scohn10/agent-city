import { billingConfigured, verify, syncCustomerPlan, planCookie, json, publicError } from '../../../../lib/server/billing';

export const runtime = 'nodejs';

// POST { token } from a restore link -> { plan }. Lets a subscriber use their plan on another device.
export async function POST(req) {
  if (!billingConfigured()) return json({ error: 'Payments are not set up yet.' }, { status: 503 });
  let body = {};
  try { body = await req.json(); } catch {}
  const t = verify(String(body.token || '').trim());
  if (!t || t.kind !== 'restore' || typeof t.cid !== 'string') return json({ error: 'That restore link isn\'t valid.' }, { status: 400 });
  try {
    const plan = await syncCustomerPlan(t.cid);
    return json({ plan }, { cookie: planCookie({ cid: t.cid, plan }) });
  } catch (e) {
    return json({ error: publicError(e) }, { status: 502 });
  }
}
