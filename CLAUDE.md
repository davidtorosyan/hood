# Hood

A mobile-first, installable web game for **learning the neighborhoods of LA** — not by
memorizing exact boundaries, but by building a mental model: what region a neighborhood
is in, what it's near, what anchors it, its identity, what it's confused with, and a
one-line mental hook.

Hosted as a static site on **GitHub Pages**; no backend. Light state in localStorage.

> Design history: v1 was a map game (tap/identify polygons). We deliberately pivoted away
> from that — staring at a giant LA map and clicking shapes tests knowledge but teaches
> poorly. The current design is three relationship-driven modes. The old map render was
> retired; we kept only neighborhood **centroids** to compute proximity questions.

## Top directives (from Dave)
- **Dave does not review code or UI first — you do.** After ANY change that affects the
  interface, run the **`ui-review` skill** (screenshot → critique → fix → re-shoot).
  Not optional. See `.claude/skills/ui-review/SKILL.md`.
- Keep it lightweight: vanilla JS, minimal deps, fast and smooth on a phone.
- **Tone:** curious, friendly, lightly playful. Partial credit, not harsh correction. No
  heavy scoring, no streak pressure, no giant-map UI, no long textbook explanations.
- These three modes are **playtest prototypes** to discover the best learning loop — favor
  making them distinct and trying ideas over polishing one.

## The three modes (+ browse)
1. **Daily Mystery** (`src/modes/mystery.js`) — a mystery neighborhood revealed through
   clues one at a time (region → nearby → anchors → identity → hook). Guess any time;
   partial credit (exact / same cluster / right region / right next door). Ends on a
   learning card + two quick reinforcement questions.
2. **Card Battle** (`src/modes/battle.js`) — fast A-vs-B comparisons, each with a short
   teaching explanation. Generators: region ("more Valley?"), proximity ("closer to
   Downtown?" via centroids), related-pair, anchor association, odd-one-out.
3. **Build the Cluster** (`src/modes/cluster.js`) — reason about a small cluster (first:
   Northeast LA) — membership, "between", and which-side orientation. No big map.
4. **Browse** (`src/modes/browse.js`) — reference list of every learning card by region.

## Stack
- **Vite** dev server + static build. **vanilla JS** (no framework).
- **d3-geo** only for centroid-based proximity (`src/geo.js`).
- **vite-plugin-pwa** for the installable PWA. **Playwright** for the screenshot harness.

## Project layout
- `src/main.js` — home mode-picker + router.
- `src/modes/*.js` — the four modes above.
- `src/data/neighborhoods.js` — **the content**: per-neighborhood cards (region, cluster,
  nearby[], anchors[], identity, confusions[], hook). This is where most work happens.
- `src/data/centroids.json` — generated; `{ name: [lng,lat] }`, 4KB, for proximity.
- `src/data/boundaries.json` — generated; full polygons (NOT imported by the app — kept
  for regenerating centroids / possible future use).
- `src/relate.js` — closeness/partial-credit + region phrasing, shared by modes.
- `src/ui/` — `dom.js` (el helper), `chrome.js` (mode shell), `card.js` (learning card).
- `src/store.js` — minimal localStorage (daily result + seen counts).
- `scripts/build-boundaries.mjs` — raw GeoJSON → `boundaries.json` + `centroids.json`.
- `scripts/screenshots.mjs` — UI-review harness (walks all modes at phone viewport).
- `scripts/icons.mjs` — favicon.svg → PWA PNG icons.

## Content model (the important part)
`neighborhoods.js` holds ~32 hand-authored cards. `name` matches a boundary feature so
proximity works. `nearby` may include real places outside our card set (Glendale, Culver
City…) for realism; only names that ARE cards become quiz options. To grow the game, add
cards — keep `nearby`/`cluster` accurate since the modes generate questions from them.
- **Phase 1 scope:** City of LA neighborhoods, ~32 cards, NELA cluster fully fleshed.
- **Phase 2 (Dave's real goal):** all of LA County (Glendale, Santa Monica, Pasadena…) —
  needs more boundary sources + more cards.

### ⚠️ Winding-order gotcha (still relevant for new boundary data)
d3-geo wants **clockwise** exterior rings; raw data had reversed polygons (e.g. San Pedro)
that d3 reads as "covers the whole globe." `build-boundaries.mjs` runs
`@mapbox/geojson-rewind(gj, true)`. Keep that for any new boundary data.

## Dev workflow
- `npm run dev` — dev server (`--host`, LAN-accessible for phone testing). Port drifts if
  taken; check the printed URL / `.vite-dev.log`.
- `npm run build` — static build to `dist/` (`BASE_PATH` defaults to `/hood/`).
- `npm run preview` — serve the production build.

## Deploy (GitHub Pages)
Build with the correct `BASE_PATH` and publish `dist/`. A GitHub Actions workflow can be
added to build on push to `main` and deploy to Pages.

## What we're trying to learn from playtesting
Which mode is most fun / teaches most / best builds relative-location intuition / feels
too quiz-like / makes Dave want to keep playing; and which info (region, nearby, anchors,
history, etc.) sticks best. Build to answer those, not to ship a finished system.
