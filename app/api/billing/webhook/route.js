import { stripe, syncCustomerPlan } from '../../../../lib/server/billing';

export const runtime = 'nodejs';

// Keeps each customer's plan in sync as subscriptions start, renew, change, fail, or cancel.
// Configure in Stripe: endpoint https://<your-domain>/api/billing/webhook with the events below.
const EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
]);

export async function POST(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return new Response('Webhook not configured', { status: 503 });

  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, req.headers.get('stripe-signature') || '', secret);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  if (!EVENTS.has(event.type)) return new Response('ignored', { status: 200 });

  const obj = event.data.object || {};
  // Checkout: only fulfil once payment has actually succeeded.
  if (event.type.startsWith('checkout.session.') && obj.payment_status !== 'paid' && obj.payment_status !== 'no_payment_required') {
    return new Response('pending', { status: 200 });
  }
  const customer = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
  if (!customer) return new Response('no customer', { status: 200 });

  try {
    await syncCustomerPlan(customer);
  } catch {
    // Non-2xx makes Stripe retry later.
    return new Response('sync failed', { status: 500 });
  }
  return new Response('ok', { status: 200 });
}
