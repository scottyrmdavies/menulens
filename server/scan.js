// Menu scan. The hot path races every configured Gemini key on
// gemini-3.5-flash-lite (thinking MINIMAL) and streams dishes as they parse.
// A second key (GEMINI_API_KEY_2) is optional. If the fast model is busy,
// one short fallback to gemini-3.8-flash runs inside a 9 second budget.
// Google Cloud Vision is an optional OCR hint and is not waited on for long.
import { classifyDishes, parseModelJson } from './classify.js';
import { createDishParser, readSseData } from './dishStream.js';
import { billingConfigured, checkAccess } from './billing.js';
import { MAX_IMAGE_BASE64_CHARS, MAX_REQUEST_BYTES } from '../shared/limits.js';
import { normalizeLanguage } from '../shared/phrases.js';

const FAST_MODEL = Object.freeze({
  id: 'gemini-3.5-flash-lite',
  thinkingLevel: 'MINIMAL',
  attemptTimeoutMs: 8_000,
});
const FALLBACK_MODEL = Object.freeze({
  id: 'gemini-3.8-flash',
  thinkingLevel: 'LOW',
  attemptTimeoutMs: 8_000,
});
const GEMINI_MODELS = Object.freeze([FAST_MODEL, FALLBACK_MODEL]);
const GEMINI_MODEL = FAST_MODEL.id;
const GEMINI_URL = geminiStreamUrl(GEMINI_MODEL);
const BUSY_MESSAGE = 'The menu scanner is busy right now. Wait a moment and try again.';
const SPEED_BUDGET_MS = 9_000;
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const VISION_TIMEOUT_MS = 1_500;
const MAX_OCR_CHARS = 20_000;

function geminiStreamUrl(modelId) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`;
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function httpError(message, status, flags = {}) {
  return Object.assign(new Error(message), { status, ...flags });
}

function configuredKeys(env) {
  const keys = [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  return [...new Set(keys)];
}

function healthStatus(env = process.env) {
  return { ok: configuredKeys(env).length > 0 };
}

function redact(message, env) {
  let text = message || 'Menu scan failed.';
  for (const secret of [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GOOGLE_CLOUD_VISION_API_KEY]) {
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

function extractionPrompt(menuText, preferences) {
  const notes = typeof preferences.notes === 'string' ? preferences.notes.replace(/["\n\r]/g, ' ').trim().slice(0, 500) : '';
  const ocr = menuText
    ? `\n\nAn optional OCR pass produced the text below. It can miss words or merge lines. Trust the photograph when they disagree.\n"""\n${menuText}\n"""`
    : '';
  const note = notes
    ? `\n\nThe guest also said: """${notes}""". Set noteConflict true only when that note clearly conflicts with the dish. Do not invent dishes from the note.`
    : '';
  return `The photograph is a restaurant menu. It may be in any language. Read the dishes and drinks a guest could order. Keep each name exactly as printed. Return JSON only, with this shape:
{"dishes":[{"name":"string","alcohol":false,"noteConflict":false,"allergens":["Peanuts"|"Tree Nuts"|"Milk"|"Eggs"|"Fish"|"Shellfish"|"Wheat"|"Soy"|"Sesame"],"tags":[{"id":"vegetarian"|"vegan"|"gluten-free"|"dairy-free"|"nut-free"|"low-carb"|"keto"|"halal"|"kosher","basis":"stated"|"estimate"}]}]}

Rules:
- One object per dish or drink. Do not invent dishes that are not on the menu.
- Set alcohol true only for an alcoholic drink or an item the menu says contains alcohol.
- Allergens only when the menu names an ingredient or allergen that supports them. Wheat includes gluten grains. Milk includes dairy. Tree Nuts includes named tree nuts.
- basis "stated" only when the menu itself uses that diet (vegan, vegetarian, gluten-free, GF, dairy-free, nut-free, keto, low-carb, halal, kosher, or the same words). Any diet you infer from ingredients or the dish name must use basis "estimate".
- Omit a tag when you cannot support it. Omit allergens you cannot support.
- If the photograph is not a menu, or you cannot read any dishes, return {"dishes":[]}.
${note}${ocr}`;
}

function preferencesOf(body) {
  const preferences = body.preferences && typeof body.preferences === 'object' && !Array.isArray(body.preferences)
    ? body.preferences
    : {};
  return preferences;
}

function modelText(payload) {
  if (payload?.promptFeedback?.blockReason) {
    throw httpError('Gemini declined to read that photo. Try another picture of the menu.', 422, { fatal: true });
  }
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  return parts
    .filter((part) => part?.thought !== true && typeof part?.text === 'string')
    .map((part) => part.text)
    .join('');
}

function isBusyResponse(response, payload) {
  const status = response?.status;
  const message = `${payload?.error?.message || ''} ${payload?.error?.status || ''}`.toLowerCase();
  if (status === 429 || status === 503) return true;
  return status >= 500 && /high demand|overload|unavailable|resource exhausted|try again/.test(message);
}

function geminiFailure(response, payload, env, modelId) {
  if (response.status === 400) {
    const detail = payload?.error?.message || '';
    if (/image|mime|inline|unsupported/i.test(detail)) {
      return httpError('Gemini could not read that photo. Try a closer, well-lit picture of the menu.', 422, { fatal: true });
    }
    return httpError(redact(detail, env) || 'Gemini rejected the scan request.', 502, { fatal: true });
  }
  if (response.status === 401 || response.status === 403) {
    return httpError('The Gemini API key was rejected. Check GEMINI_API_KEY.', 502, { fatal: true });
  }
  if (response.status === 404) {
    return httpError(`The dish model ${modelId} is not available to this API key.`, 502, { skipModel: true });
  }
  if (isBusyResponse(response, payload)) {
    return httpError(BUSY_MESSAGE, 503, { busy: true });
  }
  const message = payload?.error?.message || 'Gemini could not read that menu photo.';
  return httpError(redact(message, env), 502, { skipModel: true });
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

function requestBody(model, image, menuText, preferences) {
  return JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: image.mime, data: image.data } },
          { text: extractionPrompt(menuText, preferences) },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingLevel: model.thinkingLevel },
    },
  });
}

function firstOk(attempts) {
  return new Promise((resolve, reject) => {
    if (attempts.length === 0) {
      reject(httpError(BUSY_MESSAGE, 503, { busy: true }));
      return;
    }
    let pending = attempts.length;
    let settled = false;
    const errors = [];
    for (const attempt of attempts) {
      attempt.then((value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      }, (error) => {
        errors.push(error);
        pending -= 1;
        if (!settled && pending === 0) {
          settled = true;
          reject(errors.find((item) => item.fatal) || errors[errors.length - 1]);
        }
      });
    }
  });
}

async function* dishesFromResponse(response) {
  const type = response.headers.get('content-type') || '';
  if (type.includes('text/event-stream')) {
    const parser = createDishParser();
    for await (const data of readSseData(response.body)) {
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      if (payload?.promptFeedback?.blockReason) {
        throw httpError('Gemini declined to read that photo. Try another picture of the menu.', 422, { fatal: true });
      }
      const delta = modelText(payload);
      if (!delta) continue;
      for (const dish of parser.push(delta)) yield dish;
    }
    return;
  }
  const payload = await response.json().catch(() => null);
  let dishes;
  try {
    dishes = parseModelJson(modelText(payload));
  } catch (error) {
    if (error.fatal) throw error;
    throw httpError(error.message || 'The dish model did not return readable JSON.', 502, { skipModel: true });
  }
  for (const dish of dishes) yield dish;
}

async function* streamModel(model, image, menuText, preferences, keys, env, fetchImpl, timeoutMs) {
  const controllers = keys.map(() => new AbortController());
  const timer = setTimeout(() => {
    for (const controller of controllers) controller.abort();
  }, timeoutMs);
  const body = requestBody(model, image, menuText, preferences);
  try {
    const winner = await firstOk(keys.map((key, index) => (async () => {
      try {
        const response = await fetchImpl(geminiStreamUrl(model.id), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body,
          signal: controllers[index].signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw geminiFailure(response, payload, env, model.id);
        }
        return { response, index };
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw httpError(BUSY_MESSAGE, 503, { busy: true, timeout: true });
        }
        if (error?.status) throw error;
        throw httpError('The menu scan could not reach Gemini. Try again.', 502, { network: true });
      }
    })()));
    controllers.forEach((controller, index) => {
      if (index !== winner.index) controller.abort();
    });
    try {
      yield* dishesFromResponse(winner.response);
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw httpError(BUSY_MESSAGE, 503, { busy: true, timeout: true });
      }
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

async function* generateDishes(image, menuText, preferences, env, fetchImpl, options, trace) {
  const keys = configuredKeys(env);
  const started = Date.now();
  const budgetMs = options.budgetMs ?? SPEED_BUDGET_MS;
  const now = options.now ?? Date.now;
  let count = 0;
  try {
    for await (const dish of streamModel(
      FAST_MODEL,
      image,
      menuText,
      preferences,
      keys,
      env,
      fetchImpl,
      Math.min(FAST_MODEL.attemptTimeoutMs, budgetMs),
    )) {
      count += 1;
      yield dish;
    }
    trace.model = FAST_MODEL.id;
    if (count === 0) {
      throw httpError('No menu text was detected. Try a closer, well-lit photo of the menu.', 422, { empty: true });
    }
  } catch (error) {
    if (count > 0) return;
    if (error.fatal || error.empty) throw error;
    const remaining = budgetMs - (now() - started);
    const retryable = error.busy || error.timeout || error.network || error.skipModel;
    if (!retryable || remaining < 1_500) {
      if (error.busy || error.timeout) throw httpError(BUSY_MESSAGE, 503);
      throw error;
    }
    for await (const dish of streamModel(
      FALLBACK_MODEL,
      image,
      menuText,
      preferences,
      keys.slice(0, 1),
      env,
      fetchImpl,
      Math.min(FALLBACK_MODEL.attemptTimeoutMs, remaining - 200),
    )) {
      count += 1;
      yield dish;
    }
    trace.model = FALLBACK_MODEL.id;
    if (count === 0) {
      throw httpError('No menu text was detected. Try a closer, well-lit photo of the menu.', 422);
    }
  }
}

async function rememberScan(entry, env) {
  if (typeof env.DATABASE_URL !== 'string' || env.DATABASE_URL.trim() === '') return;
  try {
    const db = await import('./db.js');
    await db.recordScan(entry, env);
  } catch {
    // Usage logging must not fail a scan the guest is waiting on.
  }
}

async function* iterateScan(body, options = {}) {
  const started = Date.now();
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const maxImageBase64Chars = options.maxImageBase64Chars ?? MAX_IMAGE_BASE64_CHARS;
  const preferences = preferencesOf(body);
  const userId = typeof body.userId === 'string' ? body.userId.trim().slice(0, 80) : '';
  const language = normalizeLanguage(preferences.language);
  const diets = Array.isArray(preferences.diets) ? preferences.diets.filter((id) => typeof id === 'string') : [];

  if (configuredKeys(env).length === 0) {
    throw httpError(
      'Menu scanning is not configured. Add GEMINI_API_KEY to the server environment. No dishes were returned.',
      503,
    );
  }
  if (billingConfigured(env) && userId) {
    const decision = await checkAccess(userId, env);
    if (!decision.allowed) {
      throw httpError('Your 3-day trial has ended. Subscribe to keep scanning.', 402);
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError('The scan request was not valid JSON.', 400);
  }

  const image = assertImage(body, maxImageBase64Chars);
  const menuText = await readMenuText(image.data, env, fetchImpl);
  const trace = { model: FAST_MODEL.id };
  const dishes = [];
  try {
    for await (const dish of generateDishes(image, menuText, preferences, env, fetchImpl, options, trace)) {
      dishes.push(dish);
      const partial = classifyDishes(dishes, preferences);
      yield {
        type: 'dish',
        safeItems: partial.safeItems,
        riskyItems: partial.riskyItems,
        allergens: partial.allergens,
      };
    }
    const result = classifyDishes(dishes, preferences);
    const durationMs = Date.now() - started;
    yield {
      type: 'done',
      safeItems: result.safeItems,
      riskyItems: result.riskyItems,
      allergens: result.allergens,
      durationMs,
      model: trace.model,
      dishCount: result.dishes.length,
    };
    void rememberScan({
      userId,
      diets,
      language,
      durationMs,
      status: 'ok',
      dishCount: result.dishes.length,
    }, env);
  } catch (error) {
    void rememberScan({
      userId,
      diets,
      language,
      durationMs: Date.now() - started,
      status: 'error',
      error: error.message,
      dishCount: dishes.length,
    }, env);
    throw error;
  }
}

async function scanMenu(body, options = {}) {
  let done = null;
  for await (const event of iterateScan(body, options)) {
    if (event.type === 'done') done = event;
  }
  if (!done) throw httpError('Menu scan failed.', 502);
  return done;
}

function parseRaw(raw, options) {
  const maxRequestBytes = options.maxRequestBytes ?? MAX_REQUEST_BYTES;
  if (new TextEncoder().encode(raw).length > maxRequestBytes) {
    return {
      error: {
        status: 413,
        body: { error: 'That photo is too large to scan. Try a closer photo of the menu.' },
      },
    };
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { error: { status: 400, body: { error: 'The scan request was not valid JSON.' } } };
  }
  return { body };
}

async function openScanStream(raw, options = {}) {
  const parsed = parseRaw(raw, options);
  if (parsed.error) return { error: parsed.error };
  const iterator = iterateScan(parsed.body, options);
  try {
    const first = await iterator.next();
    return {
      events: (async function* events() {
        if (!first.done) yield first.value;
        let next = await iterator.next();
        while (!next.done) {
          yield next.value;
          next = await iterator.next();
        }
      })(),
    };
  } catch (error) {
    return {
      error: {
        status: error.status || 500,
        body: { error: error.message || 'Menu scan failed.' },
      },
    };
  }
}

async function handleRawBody(raw, options = {}) {
  const parsed = parseRaw(raw, options);
  if (parsed.error) return parsed.error;
  return scanResponse(parsed.body, options);
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
  BUSY_MESSAGE,
  FAST_MODEL,
  GEMINI_MODEL,
  GEMINI_MODELS,
  GEMINI_URL,
  SPEED_BUDGET_MS,
  handleRawBody,
  healthStatus,
  openScanStream,
  scanMenu,
  scanResponse,
};
