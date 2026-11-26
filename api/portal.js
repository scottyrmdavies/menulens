import { customerIdFor } from '../server/db.js';
import { createPortal, safeOrigin, stripeReady } from '../server/stripe.js';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const origin = safeOrigin(request.headers.get('origin'));
  const userId = typeof body?.userId === 'string' ? body.userId.trim().slice(0, 80) : '';
  if (!origin) return Response.json({ error: 'Missing origin.' }, { status: 400 });
  if (!userId) return Response.json({ error: 'Missing user.' }, { status: 400 });
  if (!stripeReady(process.env)) return Response.json({ configured: false });
  try {
    const customerId = await customerIdFor(userId);
    if (!customerId) {
      return Response.json({ error: 'Subscribe first.' }, { status: 400 });
    }
    const result = await createPortal({
      customerId,
      origin,
      env: process.env,
      fetchImpl: globalThis.fetch,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || 'The customer portal failed.' }, { status: 502 });
  }
}
