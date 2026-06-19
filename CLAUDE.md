# Hood

A mobile-first, installable web game for learning the neighborhoods of Los Angeles.
You're shown a neighborhood and either tap where it is on the map ("where is it?") or
pick its name from the highlighted shape ("what is it?"). Every round ends on a reveal
card with the neighborhood's region, size, approximate population, a one-line history,
and a landmark. Spaced repetition resurfaces the ones you miss.

Hosted as a static site on **GitHub Pages**; no backend. Progress lives in localStorage.

## Top directives (from Dave)
- **Dave does not review code or UI first — you do.** After ANY change that affects the
  interface, run the **`ui-review` skill** (screenshot → critique → fix → re-shoot). This
  is not optional. See `.claude/skills/ui-review/SKILL.md`.
- Keep it lightweight: vanilla JS, minimal dependencies, fast and smooth on a phone.
- Record decisions and gotchas here as the project grows.

## Stack
- **Vite** dev server + static build. **vanilla JS** (no framework).
- **d3-geo** for map projection, hit-testing, and distance scoring.
- **vite-plugin-pwa** for the installable PWA (manifest + offline service worker).
- **Playwright** drives the screenshot-review harness and rasterizes icons.

## Project layout
- `index.html` — shell, mobile viewport meta.
- `src/main.js` — home screen + router.
- `src/game.js` — session orchestrator: round queue, both round types, scoring, reveal.
- `src/map.js` — SVG map render + the geo plumbing (project taps → lng/lat, `isInside`,
  `distanceKm`). One shared `geoMercator` fit to LA's extent.
- `src/store.js` — localStorage progress + Leitner-style spaced repetition.
- `src/data/neighborhoods.js` — curated quiz set: facts (region, size, population,
  history, landmark). `name` must match a boundary feature.
- `src/data/boundaries.json` — generated; compact neighborhood polygons + centroids.
- `scripts/build-boundaries.mjs` — regenerates `boundaries.json` from the raw GeoJSON.
- `scripts/screenshots.mjs` — the UI-review eye (phone viewport, full-session capture).
- `scripts/icons.mjs` — rasterizes `public/favicon.svg` → PWA PNG icons.

## Data
- Boundaries: LA Times "Mapping L.A." neighborhood boundaries (114 City-of-LA hoods),
  obtained via LA GeoHub. Raw file: `la_hoods_raw.geojson` (kept for rebuilds).
- Rebuild the shipped boundaries with: `node scripts/build-boundaries.mjs`.
- **Phase 1 scope:** City of LA neighborhoods only. Phase 2: expand to LA County cities
  (Glendale, Santa Monica, Pasadena, …) — will need additional boundary sources.
- The curated quiz set in `neighborhoods.js` is ~19 well-known hoods. **Populations are
  approximate and rounded — flagged for a verification/research-fill pass.**

### ⚠️ Winding-order gotcha
d3-geo uses spherical math and wants **clockwise** exterior rings. The raw data had at
least one polygon (San Pedro) wound the other way, which d3 reads as "covers the whole
globe" — it broke both rendering and `geoContains`. `build-boundaries.mjs` runs
`@mapbox/geojson-rewind(gj, true)` to fix this. Keep that step for any new boundary data.

## Dev workflow
- `npm run dev` — dev server with `--host` (LAN-accessible for phone testing). The port
  drifts if others are taken; check the printed URL / `.vite-dev.log`.
- `npm run build` — static build to `dist/`. Set `BASE_PATH` if the repo name isn't
  `hood` (the GitHub Pages base path defaults to `/hood/`).
- `npm run preview` — serve the production build.

## Deploy (GitHub Pages)
Build with the correct `BASE_PATH` (defaults to `/hood/`) and publish `dist/`. A GitHub
Actions workflow can be added to build on push to `main` and deploy to Pages.

## Game design notes
- Sessions are ~10 rounds, alternating the two round types. A miss re-asks that hood once
  more later in the same session (the opposite round type) to lock it in.
- "Where" scoring: inside the boundary = nailed it; else graded by distance to centroid.
- Cross-session, `store.js` weights selection toward unseen / low-mastery neighborhoods.
