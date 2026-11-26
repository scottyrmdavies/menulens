let schemaReady = null;

function databaseUrl(env) {
  return typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : '';
}

function publicDbError(error, env) {
  let text = error?.message || 'The database request failed.';
  const url = databaseUrl(env);
  if (url) text = text.split(url).join('[redacted]');
  return text.slice(0, 300);
}

async function getSql(env = process.env) {
  const url = databaseUrl(env);
  if (!url) return null;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS profiles (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        email text NOT NULL,
        diets text NOT NULL DEFAULT '[]',
        other_text text NOT NULL DEFAULT '',
        consent boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS scans (
        id bigserial PRIMARY KEY,
        user_id text,
        diets text NOT NULL DEFAULT '[]',
        language text,
        duration_ms integer,
        status text NOT NULL,
        error text,
        dish_count integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS users (
        user_id text PRIMARY KEY,
        trial_started_at timestamptz NOT NULL DEFAULT now(),
        stripe_customer_id text,
        subscription_status text
      )`;
    })();
  }
  await schemaReady;
  return sql;
}

async function saveProfile({ userId, email, diets, otherText, consent }, env = process.env) {
  const sql = await getSql(env);
  if (!sql) return { saved: false, reason: 'DATABASE_URL is not set.' };
  await sql`INSERT INTO profiles (user_id, email, diets, other_text, consent)
    VALUES (${userId}, ${email}, ${JSON.stringify(diets)}, ${otherText}, ${consent})`;
  await sql`INSERT INTO users (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;
  return { saved: true };
}

async function ensureUser(userId, env = process.env) {
  const sql = await getSql(env);
  if (!sql) return null;
  await sql`INSERT INTO users (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;
  const rows = await sql`SELECT user_id, trial_started_at, stripe_customer_id, subscription_status
    FROM users WHERE user_id = ${userId}`;
  return rows[0] ?? null;
}

async function setSubscription(userId, customerId, status, env = process.env) {
  const sql = await getSql(env);
  if (!sql || !userId) return false;
  await sql`INSERT INTO users (user_id, stripe_customer_id, subscription_status)
    VALUES (${userId}, ${customerId}, ${status})
    ON CONFLICT (user_id) DO UPDATE
    SET stripe_customer_id = ${customerId}, subscription_status = ${status}`;
  return true;
}

async function setSubscriptionByCustomer(customerId, status, env = process.env) {
  const sql = await getSql(env);
  if (!sql || !customerId) return false;
  await sql`UPDATE users SET subscription_status = ${status} WHERE stripe_customer_id = ${customerId}`;
  return true;
}

async function customerIdFor(userId, env = process.env) {
  const sql = await getSql(env);
  if (!sql) return null;
  const rows = await sql`SELECT stripe_customer_id FROM users WHERE user_id = ${userId}`;
  return rows[0]?.stripe_customer_id ?? null;
}

async function recordScan(entry, env = process.env) {
  const sql = await getSql(env);
  if (!sql) return;
  const diets = Array.isArray(entry.diets) ? entry.diets : [];
  await sql`INSERT INTO scans (user_id, diets, language, duration_ms, status, error, dish_count)
    VALUES (
      ${entry.userId || null},
      ${JSON.stringify(diets)},
      ${entry.language || null},
      ${Number.isFinite(entry.durationMs) ? entry.durationMs : null},
      ${entry.status || 'error'},
      ${entry.error ? String(entry.error).slice(0, 300) : null},
      ${Number.isFinite(entry.dishCount) ? entry.dishCount : null}
    )`;
}

async function adminStats(env = process.env) {
  const sql = await getSql(env);
  if (!sql) return { configured: false };
  const [byDay, uniqueRow, dietMix, profileMix, timing, errors, totals, profiles] = await Promise.all([
    sql`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS scans
      FROM scans GROUP BY 1 ORDER BY 1 DESC LIMIT 14`,
    sql`SELECT count(DISTINCT user_id)::int AS users FROM scans
      WHERE created_at > now() - interval '1 day' AND user_id IS NOT NULL`,
    sql`SELECT diet, count(*)::int AS scans
      FROM scans
      CROSS JOIN LATERAL jsonb_array_elements_text(diets::jsonb) AS diet
      GROUP BY diet ORDER BY scans DESC`,
    sql`SELECT diet, count(*)::int AS profiles
      FROM profiles
      CROSS JOIN LATERAL jsonb_array_elements_text(diets::jsonb) AS diet
      GROUP BY diet ORDER BY profiles DESC`,
    sql`SELECT coalesce(round(avg(duration_ms)), 0)::int AS avg_ms
      FROM scans WHERE status = 'ok' AND duration_ms IS NOT NULL`,
    sql`SELECT count(*)::int AS errors FROM scans WHERE status <> 'ok'`,
    sql`SELECT count(*)::int AS scans FROM scans`,
    sql`SELECT count(*)::int AS profiles FROM profiles`,
  ]);
  return {
    configured: true,
    scans: totals[0]?.scans ?? 0,
    profiles: profiles[0]?.profiles ?? 0,
    uniqueUsersToday: uniqueRow[0]?.users ?? 0,
    averageDurationMs: timing[0]?.avg_ms ?? 0,
    errors: errors[0]?.errors ?? 0,
    scansByDay: byDay,
    dietMix,
    profilesByDiet: profileMix,
  };
}

export {
  adminStats,
  customerIdFor,
  ensureUser,
  getSql,
  publicDbError,
  recordScan,
  saveProfile,
  setSubscription,
  setSubscriptionByCustomer,
};
