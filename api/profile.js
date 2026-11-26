import { knownDiets } from '../shared/profile.js';
import { publicDbError, saveProfile } from '../server/db.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 200) : '';
  const userId = typeof body?.userId === 'string' ? body.userId.trim().slice(0, 80) : '';
  const otherText = typeof body?.other === 'string' ? body.other.trim().slice(0, 500) : '';
  const diets = knownDiets(body?.diets);
  if (!userId) {
    return Response.json({ saved: false, reason: 'Missing user.' }, { status: 400 });
  }
  if (!EMAIL.test(email)) {
    return Response.json({ saved: false, reason: 'Enter an email address.' }, { status: 400 });
  }
  if (body?.consent !== true) {
    return Response.json({ saved: false, reason: 'Consent is required.' }, { status: 400 });
  }
  try {
    const result = await saveProfile({ userId, email, diets, otherText, consent: true });
    const status = result.saved ? 200 : 503;
    return Response.json(result, { status });
  } catch (error) {
    return Response.json({ saved: false, reason: publicDbError(error, process.env) }, { status: 502 });
  }
}
