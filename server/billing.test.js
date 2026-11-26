import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIAL_MS, accessDecision } from './billing.js';

const DAY = 24 * 60 * 60 * 1000;

test('missing Stripe or database keys leave scans open', () => {
  assert.deepEqual(accessDecision({ stripeConfigured: false, databaseConfigured: false }), {
    allowed: true,
    mode: 'free',
  });
  assert.equal(accessDecision({ stripeConfigured: true, databaseConfigured: false }).allowed, true);
  assert.equal(accessDecision({ stripeConfigured: false, databaseConfigured: true }).allowed, true);
});

test('a three day trial stays open and then requires a subscription', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const started = new Date(now - (2 * DAY)).toISOString();
  const trial = accessDecision({
    stripeConfigured: true,
    databaseConfigured: true,
    trialStartedAt: started,
    now,
  });
  assert.equal(trial.allowed, true);
  assert.equal(trial.mode, 'trial');

  const expired = accessDecision({
    stripeConfigured: true,
    databaseConfigured: true,
    trialStartedAt: new Date(now - TRIAL_MS - 1000).toISOString(),
    now,
  });
  assert.deepEqual(expired, { allowed: false, mode: 'expired' });
});

test('an active subscription is allowed after the trial', () => {
  const decision = accessDecision({
    stripeConfigured: true,
    databaseConfigured: true,
    subscriptionStatus: 'active',
    trialStartedAt: new Date(Date.now() - 10 * DAY).toISOString(),
  });
  assert.equal(decision.mode, 'subscribed');
  assert.equal(decision.allowed, true);
});
