import { openScanStream } from '../server/scan.js';

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
  const opened = await openScanStream(raw);
  if (opened.error) {
    return Response.json(opened.error.body, { status: opened.error.status });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of opened.events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      } catch (error) {
        const event = {
          type: 'error',
          status: error.status || 500,
          error: error.message || 'Menu scan failed.',
        };
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
