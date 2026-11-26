import { createCheckout, safeOrigin } from '../server/stripe.js';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const origin = safeOrigin(request.headers.get('origin'));
  const userId = typeof body?.userId === 'string' ? body.userId.trim().slice(0, 80) : '';
  if (!origin) return Response.json({ error: 'Missing origin.' }, { status: 400 });
  if (!userId) return Response.json({ error: 'Missing user.' }, { status: 400 });
  try {
    const result = await createCheckout({
      userId,
      origin,
      env: process.env,
      fetchImpl: globalThis.fetch,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || 'Checkout failed.' }, { status: 502 });
  }
}
