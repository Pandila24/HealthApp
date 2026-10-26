# HealthApp

A personal nutrition, workout and running tracker. It's an installable web app (PWA): it runs on iPhone and Android from the home screen, with no App Store and no subscription.

## Features

| Area | What it does |
|---|---|
| **Today** | Calorie ring, protein/carbs/fat/sugar bars, weekly stats, body-weight trend, and personalized suggestions |
| **Food** | Search **USDA FoodData Central** (whole foods) and **Open Food Facts** (packaged foods), **scan barcodes** with the camera, custom foods, recents, copy yesterday's meal, and per-meal totals for calories, protein, carbs, fat, sugar and fiber |
| **Plan** | A 5-day lift + conditioning program for a lean, athletic, upper-body-focused build (no ice needed): phase-aware calorie/macro targets sized from lean mass, a rotating nut-free/fish-free meal plan scaled to your calories (log a meal or the whole day in one tap, weekly grocery list), the weekly schedule with one-tap workout start, conditioning log, body check-ins (weight, body fat %, waist, arm, chest) and calorie-pace advice |
| **Train** | 870+ exercise library with **animated start/end photos** and step-by-step instructions, filtered by muscle and equipment. Routines (starter full-body program included), live workout logging with previous-session values, PR detection, rest timer, and history |
| **Run** | GPS tracking with a live map (OpenStreetMap), distance, moving time, pace, mile/km splits, weekly mileage chart, and auto-pause recovery if the phone kills the app |
| **Me** | Profile → auto calorie/macro targets (Mifflin-St Jeor), or manual targets, lb/mi or kg/km units, and JSON backup/restore |

### Training plan
Open the **Plan** tab and enter your starting numbers. The plan runs in three phases: **Re-entry** (weeks 1–2, mild deficit, fewer sets), **Lean-out** (about 22% below maintenance, protein at 1 g per lb of lean mass) and **Upper-body build** (small surplus, extra arm/delt sets), with a deload every 6th week and a diet break every 12th week of the cut. Daily targets follow the phase automatically and recalculate whenever you log a weigh-in or body-fat check-in. All the exercises come from the built-in library, and the program routines land in **Train** where you can edit them.

### Suggestions engine (free, on-device)
- Protein pacing ("65 g to go", with food ideas), sugar over limit, low fiber, 7-day calorie average vs target
- Weight trend vs goal (stalled, losing too fast, not gaining)
- Double progression: "go heavier" after 12+ reps on every set, otherwise "add a rep"
- Muscle groups not trained in 8 days, rest-day nudge after 6 days in a row
- Run/walk starter plan, and a warning when weekly mileage jumps more than 10%

## Cost

| Piece | Cost |
|---|---|
| Hosting (GitHub Pages / Netlify / Cloudflare Pages) | Free |
| Food data (USDA key, Open Food Facts) | Free |
| Exercise images ([free-exercise-db](https://github.com/yuhonas/free-exercise-db), public domain) | Free |
| Maps (OpenStreetMap) | Free |

All data stays on your device (IndexedDB). Use **Me → Export backup** to save a copy.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build in dist/
```

## Deploy (free)

- **GitHub Pages:** `.github/workflows/deploy.yml` builds and deploys on every push to `main`. Enable it under *Settings → Pages → Source: GitHub Actions*. Pages on a private repo needs GitHub Pro; otherwise use the next option.
- **Netlify / Cloudflare Pages** (free, works with private repos): connect the repo, build command `npm run build`, output folder `dist`.

Then open the URL on your phone and choose **Add to Home Screen** (Safari share menu on iPhone, ⋮ menu on Android).

## Known limits (web app vs native)
- **Running:** keep the screen on during runs (the app requests a wake lock). iOS stops GPS for web apps when the screen locks.
- **Apple Health / Google Health Connect:** native-only APIs, so this app can't read them. See the roadmap.
