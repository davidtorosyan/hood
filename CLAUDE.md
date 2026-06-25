# Hood — rewrite charter

A mobile-first, installable web game for **learning the neighborhoods of Los Angeles** by
building a mental map: not memorizing exact boundaries, but learning what region a place is
in, what it's near, and where it sits. Hosted as a static site on **GitHub Pages**, no
backend, light state in localStorage.

> **This is a clean-slate rewrite.** A prototype (the `prototypes` branch) explored the
> design and proved out the fun. This `main` branch was rebuilt from scratch around the one
> validated mode — the zoomable Jigsaw — with a clean, modular architecture. The build has
> started; see **Current architecture** below.

## Why a rewrite
The prototype validated the concept and taught us a lot (all captured in the `prototypes`
branch's `CLAUDE.md` — read it). But its core mode grew organically into one large, fragile
file with many interacting flags and timers. We want a clean, well-structured codebase we
can build on toward the real goal (all of LA County). Rewrite the code; **keep the lessons
and the data.**

## What to build (the validated concept)
A **zoomable jigsaw map of LA**, and that's the heart of it:
- Assemble a map from a handful of loose **pieces** by dragging them together; they connect
  only when they're true geographic **neighbors** in the right relative position.
- Tap an assembled piece to **camera-zoom into it** and assemble the next level down:
  **regions → groups of neighborhoods → individual neighborhoods.**
- Every level is **capped at ~6 pieces**; bigger regions auto-split into contiguous groups.
  A piece's shape is the **union of its children**, so zooming reveals the same shape broken
  into parts.
- Navigate with a clickable **breadcrumb** and an **"up"** that zooms back out.

Start with this one mode done really well. (The prototype also had Card Battle, which was
fun, and some recall-heavy modes that flopped — see the prototype learnings before adding
more modes.)

## Use the prototype branch — don't redo work
The `prototypes` branch has working implementations, generated data, and downloaded source
data. **Reference it freely for inspiration, and especially to grab artifacts we don't want
to recreate or re-download.** Grab a file without switching branches:

```
git show prototypes:<path> > <dest>          # copy one file
git checkout prototypes -- <path>            # restore path(s) into the working tree
git checkout prototypes -- src/data scripts  # e.g. pull data + build scripts
```

High-value things to reuse rather than rebuild:
- **Raw boundary data — do NOT re-download:** `la_hoods_raw.geojson` (LA Times "Mapping
  L.A." neighborhood boundaries for the 114 City-of-LA hoods, obtained via LA GeoHub).
- **Generated geometry:** `src/data/boundaries.json`, `centroids.json`, `puzzle-shapes.json`,
  `hierarchy.json`, `puzzle-adjacency.json`.
- **Region partition & content:** `src/data/regions.js` (all 114 hoods → top-level regions),
  `src/data/neighborhoods.js` (hand-authored learning cards).
- **Build + tooling scripts:** `scripts/build-boundaries.mjs`, `scripts/build-puzzle-shapes.mjs`
  (raw GeoJSON → the hierarchy/shapes/adjacency), `scripts/icons.mjs`,
  `scripts/screenshots.mjs`, and the `.claude/skills/ui-review/` skill.

Treat the prototype's structure as a reference, not gospel — re-architect freely.

## Top directives (from Dave)
- **Dave does not review code or UI first — you do.** After ANY change that affects the
  interface, run a screenshot → critique → fix → re-shoot loop (port the `ui-review` skill
  from `prototypes`). Not optional.
- **Keep it lightweight:** minimal dependencies, fast and smooth on a phone. Vanilla JS + a
  small build tool (the prototype used Vite) is a fine default; revisit if there's reason.
- **Mobile-first, installable PWA**, dev server reachable from a phone on the LAN.
- **Tone:** curious, friendly, lightly playful. Forgiving. No heavy scoring or streak
  pressure, no giant-map-clicking quizzes, no long textbook explanations.
- **Architecture matters this time:** small, composable modules; explicit state; no
  one-giant-function. The whole reason for the rewrite.

## Scope
- **Phase 1 (done):** City of LA neighborhoods, the zoomable Jigsaw done well.
- **Phase 2 (done — urban metro):** the LA County metro — 240 areas (City-of-LA hoods +
  ~83 independent cities like Glendale/Santa Monica/Long Beach + unincorporated
  communities), grouped by geography into 7 top regions. Source: the LA Times "Mapping
  L.A." **county** GeoJSON (`la_county_raw.geojson`). Deliberately EXCLUDED (see
  `regions.js` `EXCLUDED`): the Antelope Valley + Santa Clarita Valley (cut off by
  mountains), wildland slivers, and Catalina Island — so the board stays dense (piece size
  = geographic area). Possible future: include the high desert; refine auto-derived group
  names; deepen card facts.

## Current architecture
Stack: **Vite** + **vanilla JS**, **d3-geo** for projection, **vite-plugin-pwa**,
**Playwright** for the screenshot harness. `npm run dev` (LAN host), `npm run build`
(static `dist/`, `BASE_PATH` defaults to `/hood/`), `npm run shots` (UI-review harness).

- `src/main.js` — entry; a tiny home screen with a **Play** button into the Jigsaw.
- `src/jigsaw/` — the mode, split into small modules (the point of the rewrite):
  - `index.js` — orchestrator: for one node, builds chrome + a `Board`, wires the Board's
    events to the UI, and handles navigation (up, breadcrumb jumps, zoom into a child).
    Thin wiring — no game mechanics. Replaces the prototype's fragile `runNode`.
  - `board.js` — `Board`: one node's interactive puzzle. An explicit phase machine
    (`building → play → solved`, plus transient `jumbling`/`solving`/`zooming`) owning a
    multi-pointer gesture system and camera zoom; talks out only via callbacks. Pieces form
    CLUSTERS (sub-assemblies sharing one translate) — you can build several independently
    and merge them; a drop snaps the dragged cluster onto the nearest cluster it can join
    (adjacent pieces, within snap of their true offset) and `#settleClusters` merges
    everything that lines up. Gestures: one-finger drag moves a cluster (with a true-shared-
    edge connection glow + a faint tether, and a snap "click" + spark on join); on a solved
    map a tap zooms in / opens a leaf card, a one-finger drag pans (springs back), and a
    prominent **Scramble** button (or, as a bonus, grabbing + shaking the map — playtesters
    couldn't discover the gesture alone; `index.js` also wires a best-effort devicemotion
    phone-shake) breaks it apart to play; two-finger pinch zooms in / out.
  - `piece.js` — `Piece`: one SVG group + its placement state; small methods for visual
    state (near/dragging/placed/zoomable) so DOM bookkeeping lives in one place.
  - `geometry.js` — pure, no DOM: projects a node's children to the board, piece boxes,
    scatter positions. `palette.js` — piece fills.
  - `labels.js` — `layoutLabels` plans a level's labels together: EVERY label is a
    **callout** at one uniform font size (`UNIFORM_FS`) — wrapped to ≤2 lines, pushed off
    its own piece into open space (away from board centre, trying angles/distances) with a
    leader line back, and de-collided against the other labels. The centre is clamped by the
    label's own half-size so wide names don't clip at the board edge. Collisions use per-line
    boxes (not one padded rectangle) so a wide line + narrow line don't false-positive.
    Labels render in a **top layer** (`board` `labelLayer`) above all pieces, so a name is
    never painted over by a shape; each label shares its piece's transform.
  - `tree.js` — read-only access to the generated `hierarchy/shapes/adjacency` JSON, plus
    `topRegionOf(id)` and a flat `SEARCH_ITEMS` index (regions/groups/places) for search.
  - `search.js` — the top-bar search overlay: type a place/region, live autocomplete, pick
    one to jump to its **region** (a place flashes a "X is in <region>" toast — the thing
    being learned). Wired in `index.js`; the 🔍 button rides the chrome's top-bar `action`.
  - `ui.js` — presentational chrome: breadcrumb, status banner, toast.
  - `card.js` — the tap-a-neighborhood info card (modal): name, type, region,
    approximate population, a boundary-outline thumbnail, and a fun fact. On a solved
    board a leaf tap fires `onSelectLeaf`; a group tap still zooms.
- `src/ui/` — `dom.js` (`el`/`svgEl`/`shuffle`), `chrome.js` (screen + top bar shell, with
  an optional right-side `action` slot the Jigsaw fills with the mode toggle + 🔍 search).
- **View modes** (top-bar dropdown, persisted in `store`): **Normal** (labels + inner
  subdivision lines + true geometry), **Clean** (hide labels + inner lines via the
  `mode-clean`/`mode-simple` class on `.jig-board`, so each piece is flat colour), **Simple**
  (Clean + swap in low-poly geometry). `index.js` reads `store.mode()` and passes it to
  `board.build` → `projectChildren` → `shapeOf(id, mode)`.
- `src/store.js` — minimal localStorage (placed pieces, `learnedZoom`, view `mode`).
- `src/data/` — generated geometry + `regions.js` (the partition). Regenerate with
  `npm run build:shapes` after editing `regions.js`. `puzzle-shapes-simple.json` is the
  low-poly geometry for Simple mode: built per-puzzle from a topojson topology over just the
  sibling pieces (so only sibling junctions are pinned), Visvalingam-simplified
  (`SIMPLE_MIN_WEIGHT`) so pieces stay blocky-but-tiling. (Restart `npm run dev` after a
  `build:shapes` — Vite doesn't HMR changed JSON imports.) `places.js` holds the per-neighborhood
  card content (approximate `pop`, `type`, optional `fact`), keyed by leaf name — figures are
  approximate (anchored to L.A. Almanac), so correct freely. `neighborhoods.js` is unused by
  the Jigsaw (kept as reference content for future modes / Phase 2).
- `scripts/` — `build-puzzle-shapes.mjs`, `build-boundaries.mjs`, `icons.mjs`, and
  `screenshots.mjs` (drives a full Jigsaw session for the `ui-review` skill).

**Keep these invariants** (hard-won — see prototype learnings): pointer capture on the
stable SVG root not the dragged piece; clockwise winding for any new boundary data; each
auto-clustered group a single connected component; every level capped at ~6 pieces.
Animate piece movement via the CSS `transform` **property** (`style.transform`), never the
SVG `transform` **attribute** — only Chromium transitions the attribute, so the attribute
route teleports pieces on iOS Safari/Firefox. Force a reflow between the start and end
transform so the transition actually runs. Any deferred animation/phase timer must be
cancellable (`#cancelPending`) so a follow-up action (e.g. Solve mid-Jumble) can't be
clobbered by a stale timer flipping the phase back.

## Next steps / ideas
- Flesh out auto-derived group names in `build-puzzle-shapes.mjs` (currently "X area").
- Phase 2: add LA-County boundary sources (Glendale, Santa Monica, Pasadena…) and extend
  `regions.js` + the build to cover them.
- Consider re-introducing the only other fun mode (Card Battle) once the Jigsaw is polished.
