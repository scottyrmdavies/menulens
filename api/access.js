import { checkAccess } from '../server/billing.js';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId.trim().slice(0, 80) : '';
  try {
    const decision = await checkAccess(userId);
    return Response.json(decision);
  } catch (error) {
    return Response.json({ allowed: true, mode: 'free', error: error.message || 'Access check failed.' });
  }
}
