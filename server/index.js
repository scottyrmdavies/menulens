// Menu scan server. Keys are read here only and never sent to the Vite client.
// GOOGLE_CLOUD_VISION_API_KEY — Cloud Vision Document Text Detection
// GEMINI_API_KEY — Gemini model gemini-4-hydrogen
// PORT — optional, default 8787
import http from 'node:http';
import { classifyDishes, parseModelJson } from './classify.js';

const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const GEMINI_MODEL = 'gemini-4-hydrogen';

function missingKeyNames() {
  const missing = [];
  if (!process.env.GOOGLE_CLOUD_VISION_API_KEY) missing.push('GOOGLE_CLOUD_VISION_API_KEY');
  if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  return missing;
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('That photo is too large to scan.'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function detectDocumentText(imageBase64) {
  const url = new URL(VISION_URL);
  url.searchParams.set('key', process.env.GOOGLE_CLOUD_VISION_API_KEY);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || 'Google Cloud Vision rejected the photo.';
    throw Object.assign(new Error(message), { status: 502 });
  }
  const annotation = payload?.responses?.[0];
  if (annotation?.error) {
    throw Object.assign(new Error(annotation.error.message || 'Google Cloud Vision could not read that photo.'), { status: 502 });
  }
  const text = annotation?.fullTextAnnotation?.text?.trim() ?? '';
  if (!text) {
    throw Object.assign(new Error('No menu text was detected. Try a closer, well-lit photo of the menu.'), { status: 422 });
  }
  return text;
}

function extractionPrompt(menuText) {
  return `Extract dishes from this restaurant menu text. Return JSON only, with this shape:
{"dishes":[{"name":"string","allergens":["Peanuts"|"Tree Nuts"|"Milk"|"Eggs"|"Fish"|"Shellfish"|"Wheat"|"Soy"|"Sesame"],"tags":[{"id":"vegetarian"|"vegan"|"gluten-free"|"dairy-free"|"nut-free"|"low-carb"|"keto"|"halal"|"kosher","basis":"stated"|"estimate"}]}]}

Rules:
- One object per dish or drink a guest could order. Use the printed name. Do not invent dishes.
- Allergens only when the menu names an ingredient or allergen that supports them. Wheat includes gluten grains. Milk includes dairy. Tree Nuts includes named tree nuts.
- basis "stated" only when the menu itself uses that diet (vegan, vegetarian, gluten-free, GF, dairy-free, nut-free, keto, low-carb, halal, kosher, or the same words). Any diet you infer from ingredients or the dish name must use basis "estimate".
- Omit a tag when you cannot support it. Omit allergens you cannot support.
- If this is not a menu, return {"dishes":[]}.

Menu text:
${menuText}`;
}

async function extractDishes(menuText) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
  url.searchParams.set('key', process.env.GEMINI_API_KEY);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: extractionPrompt(menuText) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || 'Gemini could not extract dishes from the menu text.';
    throw Object.assign(new Error(message), { status: 502 });
  }
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  return parseModelJson(text);
}

async function scanMenu({ imageBase64, preferences }) {
  const missing = missingKeyNames();
  if (missing.length > 0) {
    throw Object.assign(
      new Error(`Menu scanning is not configured. Add ${missing.join(' and ')} to the server environment. No dishes were returned.`),
      { status: 503 },
    );
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length < 32) {
    throw Object.assign(new Error('The scan request did not include a photo.'), { status: 400 });
  }
  const menuText = await detectDocumentText(imageBase64);
  const dishes = await extractDishes(menuText);
  return classifyDishes(dishes, preferences);
}

const server = http.createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (request.method === 'GET' && path === '/api/health') {
    sendJson(response, 200, { ok: missingKeyNames().length === 0 });
    return;
  }
  if (request.method !== 'POST' || path !== '/api/scan') {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
  try {
    const raw = await readBody(request);
    const body = JSON.parse(raw);
    const result = await scanMenu(body);
    sendJson(response, 200, {
      safeItems: result.safeItems,
      riskyItems: result.riskyItems,
      allergens: result.allergens,
    });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    const message = error instanceof SyntaxError
      ? 'The scan request was not valid JSON.'
      : (error.message || 'Menu scan failed.');
    sendJson(response, status, { error: message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const missing = missingKeyNames();
  if (missing.length > 0) {
    console.log(`Scan server on http://127.0.0.1:${PORT} (missing ${missing.join(', ')})`);
  } else {
    console.log(`Scan server on http://127.0.0.1:${PORT}`);
  }
});
