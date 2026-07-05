# Chups Analytics

Product analytics, heatmaps, and session replay for indie makers — *see where
attention pools, and where users fall off.* Think Microsoft Clarity ×
Mixpanel, sized for a small startup.

This is the **UI/UX pass**: four fully-built screens running on realistic mock
data. The tracking SDK that feeds them is the next phase (see _Roadmap_).

## Screens

| Route | What it is |
| --- | --- |
| `/` | **Overview** — KPI tiles, traffic trend, sources, top pages, devices, a live activity stream |
| `/heatmaps` | **Heatmaps** — click / attention / scroll maps over a page, most-clicked elements + rage rates. Page & mode switch via URL (`?p=/pricing&mode=scroll`) |
| `/sessions` | **Session replay** — a filmstrip list of real visits with journeys, rage-click flags, and outcomes. Filter via `?f=friction` |
| `/funnels` | **Funnels & events** — a conversion funnel with drop-off, a weekly retention cohort grid, and an event stream |

## Design language — *cartography of attention*

Behavior data is treated as terrain: heatmaps are topographic **attention
contours** rising to a hotspot. That metaphor drives the logo mark, the heat
overlay, and the palette.

- **Palette** — warm paper canvas, a two-signal data system of **ember**
  (`#ef5330`, hot / friction) and **plot teal** (`#0e8c86`, cool / volume),
  with amber · pine · clay for series. Tokens live in
  [`src/app/globals.css`](src/app/globals.css).
- **Type** — Bricolage Grotesque (display / big numbers), Inter (UI), Geist
  Mono (data, timestamps, paths).
- **Charts are hand-built SVG** ([`src/components/charts`](src/components/charts)) —
  no chart library, so every mark matches the brand and there are no React 19
  peer-dependency snags.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui (Base UI) ·
TypeScript · lucide icons.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npx tsc --noEmit   # typecheck
npm run build      # production build
```

## Architecture

- **Shell** — `src/components/app/app-shell.tsx` (sidebar + topbar, mobile
  drawer). All product routes live under the `src/app/(app)` route group.
- **Mock data** — one typed module, `src/lib/mock/data.ts`, generated with a
  seeded PRNG so server and client render identically (no hydration drift).
  Swap this for the real API without touching the screens.
- **Primitives** — `Panel`, `PageHeader` / `DeltaPill` / `Eyebrow` keep the
  screens declarative.

## Roadmap — Phase 2: tracking

The dashboards are the consumer; next is the producer.

1. A lightweight browser **tracking snippet** (`page_view`, clicks, scroll
   depth, rage/dead-click detection, custom events).
2. An **ingest endpoint** (Next route handler) writing to a store.
3. Aggregation into the shapes `src/lib/mock/data.ts` already defines — then
   point the screens at live data.
