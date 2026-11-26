const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;

function billingConfigured(env) {
  const stripe = typeof env.STRIPE_SECRET_KEY === 'string' && env.STRIPE_SECRET_KEY.trim() !== ''
    && typeof env.STRIPE_PRICE_ID === 'string' && env.STRIPE_PRICE_ID.trim() !== '';
  const database = typeof env.DATABASE_URL === 'string' && env.DATABASE_URL.trim() !== '';
  return stripe && database;
}

function accessDecision({
  stripeConfigured = false,
  databaseConfigured = false,
  subscriptionStatus = null,
  trialStartedAt = null,
  now = Date.now(),
} = {}) {
  if (!stripeConfigured || !databaseConfigured) {
    return { allowed: true, mode: 'free' };
  }
  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
    return { allowed: true, mode: 'subscribed' };
  }
  const start = trialStartedAt ? new Date(trialStartedAt).getTime() : now;
  if (!trialStartedAt || now - start < TRIAL_MS) {
    return {
      allowed: true,
      mode: 'trial',
      trialEndsAt: new Date(start + TRIAL_MS).toISOString(),
    };
  }
  return { allowed: false, mode: 'expired' };
}

async function checkAccess(userId, env = process.env) {
  const stripeConfigured = typeof env.STRIPE_SECRET_KEY === 'string' && env.STRIPE_SECRET_KEY.trim() !== ''
    && typeof env.STRIPE_PRICE_ID === 'string' && env.STRIPE_PRICE_ID.trim() !== '';
  const databaseConfigured = typeof env.DATABASE_URL === 'string' && env.DATABASE_URL.trim() !== '';
  if (!stripeConfigured || !databaseConfigured || typeof userId !== 'string' || userId.trim() === '') {
    return accessDecision({ stripeConfigured, databaseConfigured, now: Date.now() });
  }
  const { ensureUser } = await import('./db.js');
  const user = await ensureUser(userId.trim().slice(0, 80), env);
  return accessDecision({
    stripeConfigured,
    databaseConfigured,
    subscriptionStatus: user?.subscription_status ?? null,
    trialStartedAt: user?.trial_started_at ?? null,
    now: Date.now(),
  });
}

export { TRIAL_MS, accessDecision, billingConfigured, checkAccess };
