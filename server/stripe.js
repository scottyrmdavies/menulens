import { createHmac, timingSafeEqual } from 'node:crypto';

function stripeReady(env) {
  return typeof env.STRIPE_SECRET_KEY === 'string' && env.STRIPE_SECRET_KEY.trim() !== ''
    && typeof env.STRIPE_PRICE_ID === 'string' && env.STRIPE_PRICE_ID.trim() !== '';
}

function webhookReady(env) {
  return stripeReady(env) && typeof env.STRIPE_WEBHOOK_SECRET === 'string' && env.STRIPE_WEBHOOK_SECRET.trim() !== '';
}

function safeOrigin(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function redactStripe(message, env) {
  let text = message || 'Stripe request failed.';
  for (const secret of [env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET]) {
    if (secret) text = text.split(secret).join('[redacted]');
  }
  return text.slice(0, 300);
}

function signaturesMatch(expected, candidate) {
  const left = Buffer.from(expected);
  const right = Buffer.from(candidate);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function verifyStripeSignature(raw, header, secret, now = Date.now()) {
  if (typeof raw !== 'string' || typeof header !== 'string' || typeof secret !== 'string' || secret === '') {
    return false;
  }
  const parts = header.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  const age = Math.abs(now - Number(timestamp) * 1000);
  if (age > 5 * 60 * 1000) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  return signatures.some((signature) => signaturesMatch(expected, signature));
}

async function stripeForm(path, params, env, fetchImpl) {
  const response = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY.trim()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(redactStripe(payload?.error?.message, env));
  }
  return payload;
}

async function createCheckout({ userId, origin, env, fetchImpl }) {
  if (!stripeReady(env)) return { configured: false };
  const payload = await stripeForm('checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': env.STRIPE_PRICE_ID.trim(),
    'line_items[0][quantity]': '1',
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=cancel`,
    client_reference_id: userId,
  }, env, fetchImpl);
  return { configured: true, url: payload.url };
}

async function createPortal({ customerId, origin, env, fetchImpl }) {
  if (!stripeReady(env)) return { configured: false };
  const payload = await stripeForm('billing_portal/sessions', {
    customer: customerId,
    return_url: `${origin}/`,
  }, env, fetchImpl);
  return { configured: true, url: payload.url };
}

export {
  createCheckout,
  createPortal,
  safeOrigin,
  stripeReady,
  verifyStripeSignature,
  webhookReady,
};
