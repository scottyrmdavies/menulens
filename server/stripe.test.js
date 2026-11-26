import { createHmac } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyStripeSignature } from './stripe.js';

test('a Stripe webhook signature matches the raw body and rejects a stale one', () => {
  const secret = 'whsec_test';
  const raw = '{"type":"checkout.session.completed"}';
  const now = 1_700_000_000_000;
  const timestamp = Math.floor(now / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const header = `t=${timestamp},v1=${signature}`;
  assert.equal(verifyStripeSignature(raw, header, secret, now), true);
  assert.equal(verifyStripeSignature(`${raw} `, header, secret, now), false);
  assert.equal(verifyStripeSignature(raw, header, secret, now + 10 * 60 * 1000), false);
});
