import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanServer } from './index.js';
import { GEMINI_URL, handleRawBody, scanResponse } from './scan.js';

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

test('gemini errors are returned without calling Vision', async () => {
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async (url) => {
      assert.equal(String(url).includes('vision.googleapis.com'), false);
      return new Response(JSON.stringify({ error: { message: 'model overloaded' } }), { status: 503 });
    },
  });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /model overloaded/);
});

test('gemini quota errors stay a 429', async () => {
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async () => new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 }),
  });
  assert.equal(result.status, 429);
  assert.match(result.body.error, /free Gemini quota/);
});

test('a gemini request error that is not about the photo is kept', async () => {
  const result = await scanResponse(scanBody(), {
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetch: async () => new Response(
      JSON.stringify({ error: { message: 'thinkingLevel is invalid' } }),
      { status: 400 },
    ),
  });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /thinkingLevel is invalid/);
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
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(payload).sort(), ['allergens', 'riskyItems', 'safeItems']);
    assert.deepEqual(payload.safeItems, ['Lentil Soup — Vegan']);
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
