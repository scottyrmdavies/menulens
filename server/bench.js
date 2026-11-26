import { readFile } from 'node:fs/promises';
import { scanMenu } from './scan.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node --env-file-if-exists=.env server/bench.js path/to/menu.jpg');
  process.exit(1);
}

const bytes = await readFile(file);
const started = Date.now();
try {
  const result = await scanMenu({
    imageBase64: bytes.toString('base64'),
    mimeType: 'image/jpeg',
    preferences: { dietaryRestrictions: ['vegan'], language: 'en', diets: ['vegan'] },
  });
  console.log(JSON.stringify({
    ms: Date.now() - started,
    model: result.model,
    safe: result.safeItems.length,
    risky: result.riskyItems.length,
    allergens: result.allergens.length,
  }));
} catch (error) {
  console.log(JSON.stringify({
    ms: Date.now() - started,
    error: error.message,
    status: error.status || 500,
  }));
  process.exit(1);
}
