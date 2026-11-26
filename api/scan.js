import { handleRawBody } from '../server/scan.js';

export const config = {
  maxDuration: 300,
};

export async function POST(request) {
  let raw;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: 'The scan request could not be read.' }, { status: 400 });
  }
  const result = await handleRawBody(raw);
  return Response.json(result.body, { status: result.status });
}
