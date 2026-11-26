import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanServer } from './index.js';
import { BUSY_MESSAGE, FAST_MODEL, GEMINI_MODELS, GEMINI_URL, handleRawBody, scanResponse } from './scan.js';

function tinyJpeg() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]).toString('base64');
}

const DISHES = [
  { name: 'Lentil Soup', allergens: [], tags: [{ id: 'vegan', basis: 'stated' }] },
  { name: 'Pad Thai', allergens: ['peanuts'], tags: [] },
];

function geminiResult(dishes, { status = 200, thought = 'reading the menu' } = {}) {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [
          { thought: true, text: thought },
          { text: JSON.stringify({ dishes }) },
        ],
      },
    }],
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

function scanBody(extra = {}) {
  return {
    imageBase64: tinyJpeg(),
    mimeType: 'image/jpeg',
    preferences: { dietaryRestrictions: ['vegan'], allergens: ['Peanuts'] },
    ...extra,
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('gemini-only scan reads the photo and does not call Vision', async () => {
  const calls = [];
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return geminiResult(DISHES);
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.safeItems, ['Lentil Soup — Vegan']);
  assert.match(result.body.riskyItems[0], /Pad Thai/);
  assert.match(result.body.riskyItems[0], /contains Peanuts/);
  assert.match(result.body.riskyItems[0], /Vegan not stated on the menu/);
  assert.deepEqual(result.body.allergens, ['Peanuts']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, GEMINI_URL);
  assert.equal(calls[0].url.includes('vision.googleapis.com'), false);
  assert.equal(calls[0].url.includes('test-gemini-key'), false);
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'test-gemini-key');

  const requestBody = JSON.parse(calls[0].init.body);
  const image = requestBody.contents[0].parts[0].inline_data;
  assert.equal(image.mime_type, 'image/jpeg');
  assert.equal(image.data, tinyJpeg());
  assert.match(requestBody.contents[0].parts[1].text, /basis "stated"/);
  assert.equal(requestBody.contents[0].parts[1].text.includes('optional OCR pass'), false);
  assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
  assert.equal(requestBody.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL');
  assert.match(calls[0].url, /gemini-3\.5-flash-lite:streamGenerateContent/);
});

test('stripe keys without a database do not block scans', async () => {
  const result = await scanResponse(scanBody({ userId: 'user-1' }), {
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_PRICE_ID: 'price_example',
    },
    fetch: async () => geminiResult(DISHES),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.safeItems, ['Lentil Soup — Vegan']);
});

test('a missing Gemini key returns 503 and does not invent dishes', async () => {
  let called = false;
  const result = await scanResponse(scanBody(), {
    env: {},
    fetch: async () => {
      called = true;
      throw new Error('fetch should not run');
    },
  });
  assert.equal(called, false);
  assert.equal(result.status, 503);
  assert.match(result.body.error, /GEMINI_API_KEY/);
  assert.equal(result.body.error.includes('GOOGLE_CLOUD_VISION_API_KEY'), false);
  assert.equal(result.body.safeItems, undefined);
});

test('a file that is not a photo is rejected before Gemini', async () => {
  let called = false;
  const result = await scanResponse({
    imageBase64: Buffer.from('this is not a photo at all').toString('base64'),
    mimeType: 'image/jpeg',
  }, {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async () => {
      called = true;
      throw new Error('fetch should not run');
    },
  });
  assert.equal(called, false);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /not a readable photo/);
});

test('an oversized photo is rejected before Gemini', async () => {
  let called = false;
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    maxImageBase64Chars: 8,
    fetch: async () => {
      called = true;
      throw new Error('fetch should not run');
    },
  });
  assert.equal(called, false);
  assert.equal(result.status, 413);
  assert.match(result.body.error, /too large/);
});

function busyResponse(message, status = 503) {
  return new Response(JSON.stringify({ error: { message } }), { status });
}

test('two keys race and the first successful answer is kept', async () => {
  const keys = [];
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'free-key', GEMINI_API_KEY_2: 'paid-key' },
    fetch: async (url, init) => {
      const key = init.headers['x-goog-api-key'];
      keys.push(key);
      assert.match(String(url), /gemini-3\.5-flash-lite:streamGenerateContent/);
      if (key === 'free-key') {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return geminiResult([{ name: 'Slow Soup', allergens: [], tags: [{ id: 'vegan', basis: 'stated' }] }]);
      }
      return geminiResult([{ name: 'Fast Soup', allergens: [], tags: [{ id: 'vegan', basis: 'stated' }] }]);
    },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.safeItems, ['Fast Soup — Vegan']);
  assert.deepEqual(keys.sort(), ['free-key', 'paid-key']);
});

test('a busy fast model falls back once to flash inside the speed budget', async () => {
  const urls = [];
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'free-key', GEMINI_API_KEY_2: 'paid-key' },
    fetch: async (url, init) => {
      const modelUrl = String(url);
      urls.push(modelUrl);
      if (modelUrl.includes('gemini-3.5-flash-lite')) return busyResponse('high demand', 503);
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
      assert.equal(init.headers['x-goog-api-key'], 'free-key');
      return geminiResult(DISHES);
    },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.safeItems, ['Lentil Soup — Vegan']);
  assert.deepEqual(GEMINI_MODELS.map((model) => model.id), ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.equal(FAST_MODEL.thinkingLevel, 'MINIMAL');
  assert.equal(urls.filter((url) => url.includes('gemini-3.5-flash-lite')).length, 2);
  assert.equal(urls.filter((url) => url.includes('gemini-3.8-flash')).length, 1);
});

test('when every model is busy, the error asks for a retry and invents no dishes', async () => {
  const urls = [];
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async (url) => {
      urls.push(String(url));
      assert.equal(String(url).includes('vision.googleapis.com'), false);
      return busyResponse('model is currently experiencing high demand');
    },
  });

  assert.equal(result.status, 503);
  assert.equal(result.body.error, BUSY_MESSAGE);
  assert.equal(result.body.safeItems, undefined);
  assert.equal(urls.length, GEMINI_MODELS.length);
});

test('a timed-out fast model is not retried, and flash can still read the menu', async () => {
  const urls = [];
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async (url) => {
      urls.push(String(url));
      if (String(url).includes('gemini-3.5-flash-lite')) {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      }
      return geminiResult(DISHES);
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.safeItems, ['Lentil Soup — Vegan']);
  assert.equal(urls.filter((url) => url.includes('gemini-3.5-flash-lite')).length, 1);
  assert.match(urls.at(-1), /gemini-3\.8-flash/);
});

test('a streamed menu fills dishes as complete objects arrive', async () => {
  const part1 = '{"dishes":[{"name":"Lentil Soup","allergens":[],"tags":[{"id":"vegan","basis":"stated"}]}';
  const part2 = ',{"name":"Pad Thai","allergens":["peanuts"],"tags":[]}]}';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const part of [part1, part2]) {
        const payload = JSON.stringify({
          candidates: [{ content: { parts: [{ text: part }] } }],
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.close();
    },
  });
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async () => new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.safeItems, ['Lentil Soup — Vegan']);
  assert.match(result.body.riskyItems[0], /Pad Thai/);
});

test('a gemini request error that is not about the photo is kept', async () => {
  let calls = 0;
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ error: { message: 'thinkingLevel is invalid' } }),
        { status: 400 },
      );
    },
  });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /thinkingLevel is invalid/);
  assert.equal(calls, 1);
});

test('a photo gemini cannot read is a client error', async () => {
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async () => new Response(JSON.stringify({ error: { message: 'invalid image' } }), { status: 400 }),
  });
  assert.equal(result.status, 422);
  assert.match(result.body.error, /could not read that photo/i);
});

test('an empty dish list does not invent menu items', async () => {
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async () => geminiResult([]),
  });
  assert.equal(result.status, 422);
  assert.match(result.body.error, /No menu text was detected/);
});

test('vision text is optional context and a vision failure still scans', async () => {
  const calls = [];
  const result = await scanResponse(scanBody(), {
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      GOOGLE_CLOUD_VISION_API_KEY: 'test-vision-key',
    },
    fetch: async (url, init) => {
      calls.push(String(url));
      if (String(url).includes('vision.googleapis.com')) {
        return new Response(JSON.stringify({ error: { message: 'vision denied' } }), { status: 403 });
      }
      const body = JSON.parse(init.body);
      assert.equal(body.contents[0].parts[1].text.includes('optional OCR pass'), false);
      return geminiResult(DISHES);
    },
  });
  assert.equal(result.status, 200);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /vision\.googleapis\.com/);
  assert.equal(calls[1], GEMINI_URL);
});

test('vision text is added to the gemini prompt when OCR succeeds', async () => {
  const result = await scanResponse(scanBody(), {
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      GOOGLE_CLOUD_VISION_API_KEY: 'test-vision-key',
    },
    fetch: async (url, init) => {
      if (String(url).includes('vision.googleapis.com')) {
        return new Response(JSON.stringify({
          responses: [{ fullTextAnnotation: { text: 'Lentil Soup\nPad Thai with peanuts' } }],
        }), { status: 200 });
      }
      const body = JSON.parse(init.body);
      assert.match(body.contents[0].parts[1].text, /Lentil Soup/);
      assert.match(body.contents[0].parts[1].text, /Pad Thai with peanuts/);
      return geminiResult(DISHES);
    },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.safeItems, ['Lentil Soup — Vegan']);
});

test('POST /api/scan speaks the frontend contract on the gemini-only path', async () => {
  const urls = [];
  const server = createScanServer({
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async (url) => {
      urls.push(String(url));
      return geminiResult(DISHES);
    },
  });
  const port = await listen(server);
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.deepEqual(await health.json(), { ok: true });

    const response = await fetch(`http://127.0.0.1:${port}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanBody()),
    });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /ndjson/);
    const events = text.trim().split('\n').map((line) => JSON.parse(line));
    const done = events.find((event) => event.type === 'done');
    assert.equal(events[0].type, 'dish');
    assert.deepEqual(Object.keys(done).sort(), ['allergens', 'dishCount', 'durationMs', 'model', 'riskyItems', 'safeItems', 'type']);
    assert.deepEqual(done.safeItems, ['Lentil Soup — Vegan']);
    assert.equal(typeof done.durationMs, 'number');
    assert.equal(urls.length, 1);
    assert.equal(urls[0], GEMINI_URL);
  } finally {
    await close(server);
  }
});

test('the request handler rejects an oversized body and invalid JSON', async () => {
  const huge = await handleRawBody(`{"imageBase64":"${'a'.repeat(80)}"}`, { maxRequestBytes: 40 });
  assert.equal(huge.status, 413);
  assert.match(huge.body.error, /too large/);

  const bad = await handleRawBody('{', { maxRequestBytes: 40 });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /not valid JSON/);
});

test('the local server reports a missing key, bad JSON, and a huge body', async () => {
  const server = createScanServer({
    env: {},
    maxRequestBytes: 2000,
    fetch: async () => {
      throw new Error('fetch should not run');
    },
  });
  const port = await listen(server);
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.deepEqual(await health.json(), { ok: false });

    const missing = await fetch(`http://127.0.0.1:${port}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanBody()),
    });
    assert.equal(missing.status, 503);

    const badJson = await fetch(`http://127.0.0.1:${port}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(badJson.status, 400);
    assert.match((await badJson.json()).error, /not valid JSON/);

    const huge = await fetch(`http://127.0.0.1:${port}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'x'.repeat(2500) }),
    });
    assert.equal(huge.status, 413);
  } finally {
    await close(server);
  }
});
