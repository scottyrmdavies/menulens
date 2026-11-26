# MenuLens

Photograph a restaurant menu. MenuLens reads the dishes and sorts them into safe, risky, and allergen lists using the preferences saved in the app.

Diets the menu does not print are labeled `(estimate)` and are not treated as confirmed. If a scan fails, the app shows the error and does not invent dishes.

## Deploy on Vercel Hobby (free)

The Vite frontend and the scan API deploy as one project. Import this repo into Vercel. `vercel.json` sets the build, and the functions in `api/` become `POST /api/scan` and `GET /api/health`.

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` (default) |
| Node.js version | 22.x |
| Environment variable | `GEMINI_API_KEY` |

Create `GEMINI_API_KEY` in [Google AI Studio](https://aistudio.google.com/apikey) on the free tier. In Vercel, add it under Project Settings → Environment Variables for Production, and for Preview if preview deployments should scan. Do not prefix it with `VITE_`. The browser never receives the key.

Leave `GOOGLE_CLOUD_VISION_API_KEY` unset unless you already have Cloud Vision. The scanner is complete without it.

After deploy, open the site, finish the intro, and take a photo of a menu. The camera page posts `{ imageBase64, mimeType, preferences }` to `/api/scan` and renders `{ safeItems, riskyItems, allergens }`.

### What can block a free deploy

- **No `GEMINI_API_KEY`.** Scans return 503 and name that variable. The build itself does not need the key.
- **Hobby is for personal, non-commercial use.** A commercial product needs a paid Vercel plan.
- **Free Gemini quota.** AI Studio shows the project's requests-per-minute and requests-per-day caps. They reset on Google's schedule. Over the cap, a scan returns 429. That is still the free tier, not a bill.
- **Some AI Studio projects need a one-time verification** before the free tier answers. That is a Google account step, not a Cloud billing account.
- **Request bodies over 4.5 MB.** Vercel rejects them before the function runs (`413 FUNCTION_PAYLOAD_TOO_LARGE`). The camera resizes and JPEG-compresses each photo to stay under that. The 20 MB body option needs paid 4 GB function memory, so this app does not use it.
- **Cloud Vision is not part of the free path.** It needs a Google Cloud billing account. Unset, it is skipped. If the key is set and Vision fails, the photo still goes to Gemini.

## How a scan works

`gemini-4-hydrogen` accepts image input and structured JSON on the free Gemini Developer API, so the photograph is sent straight to `generateContent`. No separate OCR service is required.

If `GOOGLE_CLOUD_VISION_API_KEY` is set, Document Text Detection runs first and its text is added to the prompt as a hint. The picture is still sent.

The same request and response are used locally and on Vercel. Failures:

| Status | When |
| --- | --- |
| 400 | Missing photo, photo that is not an image, or a body that is not JSON |
| 413 | Photo or request larger than the Vercel body budget |
| 422 | Gemini could not read a menu, or the photo is not a menu |
| 429 | Free Gemini quota |
| 502 | Gemini rejected the key or failed |
| 503 | `GEMINI_API_KEY` is not set |
| 504 | The scan timed out |

## Local development

```bash
cp .env.example .env
# fill in GEMINI_API_KEY
npm install
npm run scan-server
npm run dev
```

`npm run dev` proxies `/api` to the local server on port 8787. `npm run scan-server` loads `.env` when that file exists.

```bash
npm test
npm run build
```
