// Menu scan. Gemini 4 Hydrogen reads the photograph directly (free Gemini
// API tier, image input, structured JSON output). Google Cloud Vision is an
// optional OCR hint when GOOGLE_CLOUD_VISION_API_KEY is set. A missing Vision
// key, or a Vision failure, still returns a full scan.
import { classifyDishes, parseModelJson } from './classify.js';
import { MAX_IMAGE_BASE64_CHARS, MAX_REQUEST_BYTES } from '../shared/limits.js';

const GEMINI_MODEL = 'gemini-4-hydrogen';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const GEMINI_TIMEOUT_MS = 45_000;
const VISION_TIMEOUT_MS = 8_000;
const MAX_OCR_CHARS = 20_000;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function geminiKey(env) {
  const key = env.GEMINI_API_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

function healthStatus(env = process.env) {
  return { ok: geminiKey(env) !== '' };
}

function redact(message, env) {
  let text = message || 'Menu scan failed.';
  for (const secret of [env.GEMINI_API_KEY, env.GOOGLE_CLOUD_VISION_API_KEY]) {
    if (secret) text = text.split(secret).join('[redacted]');
  }
  return text.slice(0, 500);
}

function normalizeBase64(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const comma = trimmed.indexOf(',');
  const payload = trimmed.startsWith('data:') && comma !== -1
    ? trimmed.slice(comma + 1)
    : trimmed;
  return payload.replace(/\s/g, '');
}

function looksLikeImage(bytes, mime) {
  if (bytes.length < 12) return false;
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mime === 'image/webp') {
    return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  }
  if (mime === 'image/heic' || mime === 'image/heif') {
    return bytes.toString('ascii', 4, 8) === 'ftyp';
  }
  return false;
}

function assertImage(body, maxImageBase64Chars) {
  const data = normalizeBase64(body?.imageBase64);
  if (data.length < 32) {
    throw httpError('The scan request did not include a photo.', 400);
  }
  if (data.length > maxImageBase64Chars) {
    throw httpError('That photo is too large to scan. Try a closer photo of the menu.', 413);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw httpError('The photo data was not valid. Take the picture again.', 400);
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length < 12) {
    throw httpError('The photo data was not valid. Take the picture again.', 400);
  }
  const rawMime = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  const mime = rawMime.split(';')[0].trim().toLowerCase() || 'image/jpeg';
  if (!ALLOWED_MIME.has(mime)) {
    throw httpError('That photo format is not supported. Use a JPEG or PNG.', 400);
  }
  if (!looksLikeImage(bytes, mime)) {
    throw httpError('That file is not a readable photo. Take the picture again.', 400);
  }
  return { data, mime };
}

function extractionPrompt(menuText) {
  const ocr = menuText
    ? `\n\nAn optional OCR pass produced the text below. It can miss words or merge lines. Trust the photograph when they disagree.\n"""\n${menuText}\n"""`
    : '';
  return `The photograph is a restaurant menu. Read the dishes and drinks a guest could order. Return JSON only, with this shape:
{"dishes":[{"name":"string","allergens":["Peanuts"|"Tree Nuts"|"Milk"|"Eggs"|"Fish"|"Shellfish"|"Wheat"|"Soy"|"Sesame"],"tags":[{"id":"vegetarian"|"vegan"|"gluten-free"|"dairy-free"|"nut-free"|"low-carb"|"keto"|"halal"|"kosher","basis":"stated"|"estimate"}]}]}

Rules:
- One object per dish or drink. Use the printed name. Do not invent dishes that are not on the menu.
- Allergens only when the menu names an ingredient or allergen that supports them. Wheat includes gluten grains. Milk includes dairy. Tree Nuts includes named tree nuts.
- basis "stated" only when the menu itself uses that diet (vegan, vegetarian, gluten-free, GF, dairy-free, nut-free, keto, low-carb, halal, kosher, or the same words). Any diet you infer from ingredients or the dish name must use basis "estimate".
- Omit a tag when you cannot support it. Omit allergens you cannot support.
- If the photograph is not a menu, or you cannot read any dishes, return {"dishes":[]}.
${ocr}`;
}

function modelText(payload) {
  if (payload?.promptFeedback?.blockReason) {
    throw httpError('Gemini declined to read that photo. Try another picture of the menu.', 422);
  }
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .filter((part) => part?.thought !== true && typeof part?.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
  if (!text) {
    throw httpError('Gemini returned no reading of the menu.', 502);
  }
  return text;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw httpError('The menu scan took too long. Try a closer photo of one page.', 504);
    }
    throw httpError('The menu scan could not reach Gemini. Try again.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function readMenuText(imageBase64, env, fetchImpl) {
  if (!env.GOOGLE_CLOUD_VISION_API_KEY) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const url = new URL(VISION_URL);
    url.searchParams.set('key', env.GOOGLE_CLOUD_VISION_API_KEY);
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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
    if (!response.ok || payload?.responses?.[0]?.error) return '';
    const text = payload?.responses?.[0]?.fullTextAnnotation?.text?.trim() ?? '';
    return text.slice(0, MAX_OCR_CHARS);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function geminiFailure(response, payload, env) {
  if (response.status === 400) {
    const detail = payload?.error?.message || '';
    if (/image|mime|inline|unsupported/i.test(detail)) {
      return httpError('Gemini could not read that photo. Try a closer, well-lit picture of the menu.', 422);
    }
    return httpError(redact(detail, env) || 'Gemini rejected the scan request.', 502);
  }
  if (response.status === 401 || response.status === 403) {
    return httpError('The Gemini API key was rejected. Check GEMINI_API_KEY.', 502);
  }
  if (response.status === 404) {
    return httpError(`The dish model ${GEMINI_MODEL} is not available to this API key.`, 502);
  }
  if (response.status === 429) {
    return httpError('The free Gemini quota is busy right now. Wait a moment and try the scan again.', 429);
  }
  const message = payload?.error?.message || 'Gemini could not read that menu photo.';
  return httpError(redact(message, env), 502);
}

async function extractDishes(image, menuText, env, fetchImpl) {
  const response = await fetchWithTimeout(fetchImpl, GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiKey(env),
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: image.mime, data: image.data } },
            { text: extractionPrompt(menuText) },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingLevel: 'MEDIUM' },
      },
    }),
  }, GEMINI_TIMEOUT_MS);

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw geminiFailure(response, payload, env);

  let dishes;
  try {
    dishes = parseModelJson(modelText(payload));
  } catch (error) {
    if (error.status) throw error;
    throw httpError(error.message || 'The dish model did not return readable JSON.', 502);
  }
  return dishes;
}

async function scanMenu(body, options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const maxImageBase64Chars = options.maxImageBase64Chars ?? MAX_IMAGE_BASE64_CHARS;

  if (geminiKey(env) === '') {
    throw httpError(
      'Menu scanning is not configured. Add GEMINI_API_KEY to the server environment. No dishes were returned.',
      503,
    );
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError('The scan request was not valid JSON.', 400);
  }

  const image = assertImage(body, maxImageBase64Chars);
  const menuText = await readMenuText(image.data, env, fetchImpl);
  const dishes = await extractDishes(image, menuText, env, fetchImpl);
  const preferences = body.preferences && typeof body.preferences === 'object' && !Array.isArray(body.preferences)
    ? body.preferences
    : {};
  const result = classifyDishes(dishes, preferences);
  if (result.dishes.length === 0) {
    throw httpError('No menu text was detected. Try a closer, well-lit photo of the menu.', 422);
  }
  return result;
}

async function handleRawBody(raw, options = {}) {
  const maxRequestBytes = options.maxRequestBytes ?? MAX_REQUEST_BYTES;
  if (new TextEncoder().encode(raw).length > maxRequestBytes) {
    return {
      status: 413,
      body: { error: 'That photo is too large to scan. Try a closer photo of the menu.' },
    };
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: 'The scan request was not valid JSON.' } };
  }
  return scanResponse(body, options);
}

async function scanResponse(body, options) {
  try {
    const result = await scanMenu(body, options);
    return {
      status: 200,
      body: {
        safeItems: result.safeItems,
        riskyItems: result.riskyItems,
        allergens: result.allergens,
      },
    };
  } catch (error) {
    const status = error.status || 500;
    return {
      status,
      body: { error: error.message || 'Menu scan failed.' },
    };
  }
}

export {
  GEMINI_MODEL,
  GEMINI_URL,
  handleRawBody,
  healthStatus,
  scanMenu,
  scanResponse,
};
