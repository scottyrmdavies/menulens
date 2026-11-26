import { setSubscription, setSubscriptionByCustomer } from '../server/db.js';
import { verifyStripeSignature, webhookReady } from '../server/stripe.js';

export const config = {
  maxDuration: 30,
};

export async function POST(request) {
  if (!webhookReady(process.env)) {
    return Response.json({ received: false, reason: 'Stripe webhooks are not configured.' }, { status: 503 });
  }
  const raw = await request.text();
  const header = request.headers.get('stripe-signature') || '';
  if (!verifyStripeSignature(raw, header, process.env.STRIPE_WEBHOOK_SECRET.trim())) {
    return Response.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid Stripe event.' }, { status: 400 });
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object ?? {};
      await setSubscription(session.client_reference_id, session.customer, 'active');
    } else if (event.type === 'customer.subscription.updated') {
      const subscription = event.data?.object ?? {};
      await setSubscriptionByCustomer(subscription.customer, subscription.status || 'active');
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data?.object ?? {};
      await setSubscriptionByCustomer(subscription.customer, 'canceled');
    }
    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ error: error.message || 'Could not store the subscription.' }, { status: 500 });
  }
}
