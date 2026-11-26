import { createHash, timingSafeEqual } from 'node:crypto';
import { adminStats } from '../server/db.js';

function passwordsMatch(input, expected) {
  const left = createHash('sha256').update(String(input)).digest();
  const right = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request) {
  const expected = typeof process.env.ADMIN_PASSWORD === 'string' ? process.env.ADMIN_PASSWORD : '';
  if (expected.trim() === '') {
    return Response.json({ error: 'Admin is not configured.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!passwordsMatch(password, expected)) {
    return Response.json({ error: 'Wrong password.' }, { status: 401 });
  }
  if (typeof process.env.DATABASE_URL !== 'string' || process.env.DATABASE_URL.trim() === '') {
    return Response.json({ configured: false, error: 'DATABASE_URL is not set.' }, { status: 503 });
  }
  try {
    return Response.json(await adminStats());
  } catch {
    return Response.json({ error: 'Could not read usage.' }, { status: 502 });
  }
}
