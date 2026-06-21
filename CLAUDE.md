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

## The modes (+ browse)
Home order is by approachability — **playtest feedback (2026-06-20): only Card Battle was
fun; the recall-heavy modes (Mystery, Cluster) were "too hard, can't get started" for a
beginner.** Lesson: modes should teach via **recognition, not recall**, and be forgiving.
Jigsaw was added as the zero-knowledge entry point; recall modes sit lower.

1. **Jigsaw** (`src/modes/jigsaw.js`) — a **zoomable map of LA**. Pieces start assembled,
   explode out, and you drag them back together (they snap only to TRUE neighbors — real
   border adjacency). Then tap a piece to camera-zoom into it and assemble the next level
   down: **regions → groups of neighborhoods → individual neighborhoods**. Every level is
   capped (`CAP = 6` pieces); a piece's shape is the union of its children, so zooming
   reveals the same shape split into parts. "↑ up" zooms back out (parent shown already
   assembled). No cards — solves show a toast. The whole tree, shapes, and sibling
   adjacency are generated into `hierarchy.json` / `puzzle-shapes.json` /
   `puzzle-adjacency.json` by `scripts/build-puzzle-shapes.mjs` from `src/data/regions.js`
   (Harbor is excluded to keep the top level at 6). Group names are auto-derived
   (largest neighborhood + " area") — refine in the build if desired.
2. **Card Battle** (`src/modes/battle.js`) — fast A-vs-B comparisons, each with a short
   teaching explanation. Generators: region ("more Valley?"), proximity ("closer to
   Downtown?" via centroids), related-pair, anchor association, odd-one-out.
3. **Daily Mystery** (`src/modes/mystery.js`) — a mystery neighborhood revealed through
   clues one at a time (region → nearby → anchors → identity → hook). Guess any time;
   partial credit (exact / same cluster / right region / right next door). Ends on a
   learning card + two quick reinforcement questions. (Known: too hard for beginners.)
4. **Build the Cluster** (`src/modes/cluster.js`) — reason about a small cluster (first:
   Northeast LA) — membership, "between", and which-side orientation. No big map.
   (Known: too hard for beginners.)
5. **Browse** (`src/modes/browse.js`) — reference list of every learning card by region.

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
- `src/data/regions.js` — partition of all 114 neighborhoods into top-level regions
  (seeds the Jigsaw hierarchy).
- `src/data/hierarchy.json` — generated; the zoomable Jigsaw tree (regions → groups → hoods).
- `src/data/puzzle-shapes.json` — generated; simplified polygon for every Jigsaw node.
- `src/data/puzzle-adjacency.json` — generated; which sibling pieces border each other.
- `src/data/boundaries.json` — generated; full polygons (NOT imported by the app — kept
  for regenerating centroids / puzzle shapes / possible future use).
- `src/relate.js` — closeness/partial-credit + region phrasing, shared by modes.
- `src/ui/` — `dom.js` (el helper), `chrome.js` (mode shell), `card.js` (learning card).
- `src/store.js` — minimal localStorage (daily result + seen counts).
- `scripts/build-boundaries.mjs` — raw GeoJSON → `boundaries.json` + `centroids.json`.
- `scripts/build-puzzle-shapes.mjs` — builds the Jigsaw hierarchy + shapes + adjacency
  (run after editing `regions.js`; auto-clusters big regions into capped, contiguous groups).
- `scripts/screenshots.mjs` — UI-review harness (walks all modes at phone viewport;
  simulates Jigsaw drags to test snapping).
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

## 🎓 Playtesting learnings (the point of this prototype)
This branch is a prototype. Here's everything we learned, so the rewrite doesn't relearn it.

### Which loop works
- **The zoomable Jigsaw map is the winner.** Dave got genuinely into it. A map you
  assemble, then tap a piece to zoom into and assemble the next level down, is fun AND
  teaches relative location mechanically.
- **Card Battle was the only other mode that was fun** — a forgiving A-vs-B with a teaching
  line every time. Works because you can engage from zero knowledge.
- **Recall-heavy modes flopped for a beginner.** Daily Mystery and Build the Cluster were
  "too hard, can't get started." The original v1 map-click quiz had the same flaw plus
  fiddly tapping.
- **Core lesson:** for someone learning from scratch, teach via **recognition + mechanical
  action, not recall.** Let the player engage before they know anything; teach through the
  interaction, don't gate on it.

### Jigsaw design that landed (build the rewrite around this)
- **Recursive, zoomable hierarchy**, hard-capped at ~6 pieces per level. Big regions
  auto-split into contiguous sub-groups down to individual neighborhoods. A node's shape is
  the **union of its children**, so zooming always shows the same shape broken into parts
  (this consistency matters — an early version zoomed a region into a differently-shaped
  curated subset and it felt broken).
- **Connect by true adjacency only.** Pieces snap to each other only when they're real
  geographic neighbors AND in the right relative position — never bridge a gap with a
  non-neighbor. Adjacency is precomputed from polygon borders.
- **Explode intro** (show assembled → burst apart → rebuild) and **camera zoom in/out**
  (animate the SVG viewBox) both feel good and are worth keeping.
- **Navigation:** a clickable **breadcrumb** (LA › region › group → …) for a sense of depth
  and to jump up levels; an explicit **"up"** that zooms out.
- **No solved cards** — a transient **toast** over a full-size map reads better than a panel
  that slides up and shrinks the board.

### Visual / UX learnings (hard-won; bake into the rewrite from day 1)
- **Use the whole screen.** Fill the viewport; measure the board and match the SVG viewBox
  so there's no letterbox waste. Small board = small pieces = unreadable.
- **Auto-size each label to its piece.** A single fixed font size across very different
  piece sizes is unreadable. Wrap long names to ~2 balanced lines, strong white halo.
- **Distinct colors for placed pieces** (gray while loose). One uniform green for an
  assembled map is hard to parse; per-piece pastel fills + white borders read like a map.
- **Signal zoomable vs terminal:** zoomable pieces show *very faint* outlines of their inner
  children (so you see they break down); leaf pieces are flat. Keep the hint subtle.
- **Debug affordances earned their keep:** a "skip explode / auto-solve" toggle and a
  "Solve" button to jump straight to a state while iterating.

### Technical gotchas (don't rediscover these)
- **Pointer capture on the stable SVG root**, not on the dragged piece. Re-parenting a piece
  to raise it cancels capture and drops the drag mid-gesture on touch.
- **Winding order:** d3-geo wants **clockwise** exterior rings. Raw boundary data AND
  `@turf/union` output can be CCW, which d3 reads as "covers the whole globe" and collapses
  the projection. Rewind clockwise (`@mapbox/geojson-rewind(gj, true)`) after any union /
  new boundary data.
- **Connected partitions:** when auto-clustering a region into groups, each group must be a
  single connected component or that sub-puzzle is unsolvable (you can't attach a piece with
  no placed neighbor). Grow groups along the adjacency graph; don't dump leftovers by
  distance.

### Honest state of this prototype
It works and is fun, but the Jigsaw code (`src/modes/jigsaw.js`) grew organically into one
large, fragile `runNode` with lots of interacting flags (ready/solved/zoomMode, explode
timers, runtime measure). That fragility is **why we're rewriting** — see the rewrite
charter on `main`.
