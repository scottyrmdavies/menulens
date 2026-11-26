// Local scan server. Production uses the Vercel functions in /api.
// Keys are read here only and never sent to the Vite client.
// GEMINI_API_KEY — required. Free key from Google AI Studio.
// GOOGLE_CLOUD_VISION_API_KEY — optional OCR hint.
// PORT — optional, default 8787.
import http from 'node:http';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { POST as adminPost } from '../api/admin.js';
import { POST as accessPost } from '../api/access.js';
import { POST as checkoutPost } from '../api/checkout.js';
import { POST as portalPost } from '../api/portal.js';
import { POST as profilePost } from '../api/profile.js';
import { POST as webhookPost } from '../api/stripe-webhook.js';
import { healthStatus, openScanStream } from './scan.js';
import { MAX_REQUEST_BYTES } from '../shared/limits.js';

const EXTRA_POSTS = {
  '/api/admin': adminPost,
  '/api/access': accessPost,
  '/api/checkout': checkoutPost,
  '/api/portal': portalPost,
  '/api/profile': profilePost,
  '/api/stripe-webhook': webhookPost,
};

function loadEnvFile(file = '.env') {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function sendJson(response, status, body) {
  if (response.writableEnded) return;
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    request.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        reject(Object.assign(
          new Error('That photo is too large to scan. Try a closer photo of the menu.'),
          { status: 413 },
        ));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', (error) => {
      if (!failed) reject(error);
    });
  });
}

function createScanServer(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch;
  const maxRequestBytes = options.maxRequestBytes ?? MAX_REQUEST_BYTES;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, healthStatus(env));
        return;
      }
      const extra = request.method === 'POST' ? EXTRA_POSTS[url.pathname] : null;
      if (extra) {
        const raw = await readBody(request, maxRequestBytes);
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (typeof value === 'string') headers.set(key, value);
        }
        const webResponse = await extra(new Request(`http://127.0.0.1${request.url}`, {
          method: 'POST',
          headers,
          body: raw,
        }));
        const text = await webResponse.text();
        response.writeHead(webResponse.status, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(text);
        return;
      }
      if (request.method !== 'POST' || url.pathname !== '/api/scan') {
        sendJson(response, 404, { error: 'Not found.' });
        return;
      }
      const raw = await readBody(request, maxRequestBytes);
      const opened = await openScanStream(raw, { env, fetch: fetchImpl, maxRequestBytes });
      if (opened.error) {
        sendJson(response, opened.error.status, opened.error.body);
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      for await (const event of opened.events) {
        response.write(`${JSON.stringify(event)}\n`);
      }
      response.end();
    } catch (error) {
      const status = error.status || 500;
      const payload = { type: 'error', status, error: error.message || 'Menu scan failed.' };
      if (response.headersSent) {
        response.write(`${JSON.stringify(payload)}\n`);
        response.end();
        return;
      }
      sendJson(response, status, { error: payload.error });
    }
  });
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (invokedDirectly()) {
  loadEnvFile();
  const port = Number(process.env.PORT) || 8787;
  const server = createScanServer();
  server.listen(port, '127.0.0.1', () => {
    if (process.env.GEMINI_API_KEY) {
      console.log(`Scan server on http://127.0.0.1:${port}`);
    } else {
      console.log(`Scan server on http://127.0.0.1:${port} (missing GEMINI_API_KEY)`);
    }
  });
}

export { createScanServer };
