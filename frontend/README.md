# Pratibimb front end

React and TypeScript front end for Pratibimb: the landing page, the doctor console, the patient view and the evaluator guide. It talks to the FastAPI backend in `../backend` through the contract in `../docs/API.md`; the visual rules are in `../docs/DESIGN.md`.

**Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3, React Router 6, Recharts 2, framer-motion 11, marked (document viewer), lucide-react for interface icons. Figtree and Mukta are self-hosted through Fontsource. The logo, app icon and the 16 animated health glyphs are hand-built SVG components in `src/brand`.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server on http://localhost:5173; `/api` is proxied to the backend on :8000 |
| `npm run dev:mock` | Dev server with no backend: the API is served from `src/api/fixtures` with in-browser state |
| `npm run build` | Type-check, then build into `dist/` (the backend serves this folder) |
| `npm run build:demo` | Build the hosted demo into `dist-demo/`: no backend, real model output replayed from `src/api/snapshot` (this is what Vercel runs) |
| `npm run preview:demo` | Serve `dist-demo/` locally |
| `npm run typecheck` | Type-check only |
| `npm run screenshots` | Screenshots of every route (needs `npm i --no-save playwright` and a running dev or preview server) |
| `node scripts/smoke.mjs` | End-to-end check of the mock flows: acknowledge, snooze, escalate, thresholds, check-in, consent, SOS |
| `node scripts/gen-fixtures.mjs` | Regenerate the fixture files (seed 42) |
| `node scripts/export-icons.mjs` | Re-export the app icon, favicon and apple-touch-icon from `src/brand` |

## Three data sources, one client

`src/api/client.ts` picks the source once:

- **Live API** (default): typed `fetch` wrappers for every endpoint in `docs/API.md`.
- **Mock** (`VITE_MOCK=1`): `src/api/mock.ts` serves fixtures. Mutations (acknowledge, snooze, escalate, thresholds, check-in, notes, consent, SOS) update in-browser state kept in `localStorage`, so the console and the patient view in two tabs stay in step. The escalation ladder runs on the demo clock.
- **Hosted demo** (`--mode demo`, see `.env.demo`): the mock client replays a snapshot of the real API taken from the trained model by `../scripts/export_snapshot.py`. The cohort list, alerts, audit log, model card and Meera's full record ship in `src/api/snapshot/core.json`; every other person's record is fetched from `public/demo/patients` when first opened.

Production builds leave out the mock and the snapshot entirely.

## Routes

- `/` landing page
- `/console` triage; `/console/patients/:id` with tabs `overview`, `twin`, `simulate`, `records`, `alerts`; `/console/alerts`, `/console/thresholds`, `/console/model`, `/console/audit`, `/console/settings`
- `/me/:id` patient view (a phone frame on desktop)
- `/guide` evaluator guide; `/guide/docs/:slug` document viewer for the files in `src/content/docs`
- `/brand` logo, icons and glyphs

## Folder layout

```
src/
  api/        client.ts, types.ts, hooks.ts, mock.ts, fixtures/, snapshot/
  brand/      Mark, Wordmark, AppIcon, Glyph (16 animated health glyphs), BrandLoader, BrandSheet
  charts/     TwinChart (three linked panels), HeroTwinChart, IntradayChart, ForecastMini, ModelCharts
  components/ ui/ (buttons, panels, chips, tabs, sheets, rings), domain/ (alerts, escalation ladder, live ticker), layout/
  content/    docs.ts and docs/*.md for the in-app document viewer
  i18n/       English and Hindi strings for the patient view
  lib/        formatting, motion helpers, theme, model numbers
  pages/      Landing, console/*, me/*, guide/*, NotFound
public/       icons, demo/ (hosted-demo records and FHIR downloads), docs/ (diagrams and screenshots)
scripts/      screenshots, smoke test, fixture generator, icon export
```
