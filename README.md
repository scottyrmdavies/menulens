# MenuLens

Photograph a restaurant menu. MenuLens reads the dishes and sorts them into safe, risky, and allergen lists for the diets you tap.

Diets the menu does not print are labeled `(estimate)` and are not treated as confirmed. If a scan fails, the app shows the error and does not invent dishes.

This is a guide, not medical advice. The same line is on onboarding and on the results.

## Deploy on Vercel Hobby

The Vite frontend and the API deploy as one project. `vercel.json` sets the build. Functions in `api/` become the `/api/*` routes.

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` (default) |
| Node.js version | 22.x |

Set the variables in Project Settings → Environment Variables for Production and Preview. Do not prefix them with `VITE_`. The browser never receives a key.

| Variable | Required | What it does |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes, for scans | Free Gemini key. The app races this key |
| `GEMINI_API_KEY_2` | No | Paid Gemini key. Raced with the free key; first answer wins |
| `DATABASE_URL` | No | Neon Postgres. Profiles, scans, and the trial clock |
| `STRIPE_SECRET_KEY` | No | Stripe secret key. Checkout and the customer portal |
| `STRIPE_PRICE_ID` | No | Monthly price. Set it to $4 (about £3). The app does not hard-code the charge |
| `STRIPE_WEBHOOK_SECRET` | No | Signing secret for `POST /api/stripe-webhook` |
| `ADMIN_PASSWORD` | No | Unlocks `/admin` |
| `GOOGLE_CLOUD_VISION_API_KEY` | No | Optional OCR hint. Leave blank |

With no Stripe keys, or no database, scans stay open. Email capture then says it could not store the address. `/admin` says it is not configured until `ADMIN_PASSWORD` is set, and it needs `DATABASE_URL` to show numbers.

Stripe webhook endpoint, after deploy: `https://<your-domain>/api/stripe-webhook`. Send `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.

### What can block a free deploy

- **No `GEMINI_API_KEY`.** Scans return 503 and name that variable. The build itself does not need the key.
- **Hobby is for personal, non-commercial use.** A commercial product needs a paid Vercel plan.
- **Free Gemini quota.** AI Studio shows the project's requests-per-minute and requests-per-day caps. A busy fast model gets one short try on `gemini-3.8-flash`. If that is busy too, the scan returns 503. No dishes are invented.
- **Some AI Studio projects need a one-time verification** before the free tier answers. That is a Google account step, not a Cloud billing account.
- **Request bodies over 4.5 MB.** Vercel rejects them before the function runs. The camera resizes each photo to 1280px JPEG before upload.
- **Cloud Vision is not part of the free path.** Leave it unset.

## How a scan works

The hot path calls `streamGenerateContent` on `gemini-3.5-flash-lite` with thinking level `MINIMAL`. That model accepts a menu photo on the free tier and is the fastest current Flash model that does. `GEMINI_API_KEY` and `GEMINI_API_KEY_2` are called together. The first response that returns dishes is kept and the other call is aborted.

Dishes are written to the browser as newline-delimited JSON as soon as each dish object is complete. The screen shows a skeleton as soon as the photo is ready, then fills the lists in. The scan budget for the model calls is 9 seconds. One busy or timed-out fast call can fall back once to `gemini-3.8-flash` if time remains. There is no long retry chain.

The menu can be in any language. Dish names stay as printed. The app speaks English, Spanish, French, Italian, German, and Portuguese.

If `GOOGLE_CLOUD_VISION_API_KEY` is set, Document Text Detection gets at most 1.5 seconds and its text is only a hint. The picture is still sent.

| Status | When |
| --- | --- |
| 400 | Missing photo, a file that is not an image, or a body that is not JSON |
| 402 | Stripe and the database are both configured, the 3-day trial is over, and there is no active subscription |
| 413 | Photo or request larger than the body budget |
| 422 | The model could not read a menu, or the photo is not a menu |
| 502 | Gemini rejected the key or failed for a reason other than being busy |
| 503 | No Gemini key is set, or the models are busy |

## Diet profile

Onboarding is tappable chips: vegan, vegetarian, nut allergy, gluten intolerant, coeliac, no alcohol, no dairy, no eggs, shellfish, soy, and “Something else, tell us”. Gluten intolerance and coeliac disease are separate chips. Both make a dish risky unless the menu states it is gluten-free. Only the gluten-intolerant chip, and only when coeliac is not also selected, shows the sourdough note. That note says wheat sourdough is not safe for coeliac disease. It does not call sourdough safe.

Vegan shows a short plant-based note. It does not link to the pastry site. More cards can be added in `shared/crossSell.js`.

## Email and usage

“Tell us your problems, we'll handle the rest” saves the email, the chip ids, the optional note, and a consent flag to Neon when `DATABASE_URL` is set. Photos and menu text are not stored.

`/admin` is password protected. It shows scans per day, unique users today, diet mix, average time to result, errors, and profiles grouped by diet. Vercel Analytics is on the page as well. It sends no menu photos.

## Trial and price

The trial is three days, counted in this app from the first saved user row. It is not a Stripe trial, so a card is not required for those days. After that, the screen offers a subscription at about **$4 / month (about £3)**. Checkout and the customer portal use the Stripe variables above. The charged amount is the Stripe Price, not a number in this repo.

### API cost against that price

Paid `gemini-3.5-flash-lite` (the model this app calls) is listed at **$0.30 per 1M input tokens** and **$2.50 per 1M output tokens**, including thinking tokens, for text, image, and video ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). A menu photo is about 1,120 image tokens. The prompt is a few hundred tokens and a typical menu answer is well under 1,000 output tokens. Thinking is set to `MINIMAL` so the output stays small.

One paid scan is about **$0.002**. If the free key and the paid key both start generating before one is aborted, count about **$0.004**. A **$4** month (about £3) covers on the order of **1,000** of those double calls. The fallback model costs more per token and is still cents per scan, not dollars. The subscription covers the API cost by a wide margin for normal use. The free key is $0 until its quota runs out. Confirm the live rates on the [Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing) before relying on the cents.

## Install

The app is a PWA: `manifest.json`, home-screen icons, and a service worker that does not cache `POST /api`. Chrome can prompt to install. The in-app text, which is also the copyable share snippet:

> On Android, tap Add to Home Screen in Chrome. On iPhone, open the Share sheet, then tap Add to Home Screen.

## Local development

```bash
cp .env.example .env
# fill in GEMINI_API_KEY
npm install
npm run scan-server
npm run dev
```

`npm run dev` proxies `/api` to the local server on port 8787.

Time a real photo when a key is set:

```bash
node --env-file-if-exists=.env server/bench.js path/to/menu.jpg
```

```bash
npm test
npm run build
```
