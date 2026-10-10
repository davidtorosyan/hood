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
**Playwright** for the screenshot harness, **node:test** for unit tests.
`npm run dev` (LAN host), `npm run build` (static `dist/`, `BASE_PATH` defaults to
`/hood/`), `npm test`, `npm run lint` (ESLint recommended — no formatter), `npm run shots` (UI-review harness; set `CHROMIUM_PATH` if
Playwright's own browser build isn't installed). CI (`.github/workflows/deploy.yml`)
runs lint + tests, builds, and deploys every push to `main` to GitHub Pages.
`ROADMAP.md` tracks the improvement plan.

### The game loop — guided assembly (playtest-driven, keep it)
Playtesters ignored the names (solved by shape) and drifted between pieces. So a
puzzle starts with one **anchor** piece on the map, and the game **asks for one piece
at a time by name** ("Place ▸ Burbank", in the prompt pill between map and tray), in a
random order where each ask **borders something already placed** (`assembly.js`;
every level is one connected group, so this always works). Only the asked-for piece
can be picked up; grabbing another wiggles it and names it ("That's Glendale"). Missed
drops escalate hints: 2 misses → "Hint: it borders X" + pulse X; 3+ → a dashed ghost
outline. ~9 s without the right grab → pulse the target in the tray. The very first ask
ever adds a spelled-out instruction and an animated finger demo (`Coach`) in the bold
dark pill; after that the ask is a quiet light chip ("NEXT Burbank 3/7") — Dave found
the bold pill too tutorial-y for ongoing play.
**Only a brand-new player's first puzzle starts itself** (assembled for a beat, then
breaks apart) — finding how to start was the original stumbling block. After that tutorial
run nothing auto-scrambles (Dave: it got in the way of exploring): an unplayed level
opens assembled with a prominent ▶ "Play this puzzle" in the tray; played ones get a
quieter "Play again". Solved levels show assembled with a ✓ on solved
sub-areas, a "🎉 X solved!" pill, chips naming every piece (in-progress ones marked),
Play again, and the region's puzzle count. **↑ Zoom out is always available** below
the county, even mid-puzzle (the run is saved per level and resumes).
**Neighbor context:** zoomed in, the areas around this one at the same depth (across
group lines, via `contextOf`) draw as faint named outlines around the map; tap one to
fly there. **Progression** (`src/progress.js`): per-region counts, a Progress screen
from home, and 19 friendly trophies with a toast — never punitive.

### Rebuild LA — the bottom-up campaign (alongside Explore)
Home offers two modes. **Explore** is the zoomable jigsaw above. **Rebuild LA**
(`src/campaign/`) is a campaign: "LA's been scrambled" and you rebuild it bottom-up on
an **overworld** that starts as just the county's empty outline (Dave: a grey map of
every place looked already built). Built places are drawn in region colour. Each built
puzzle that isn't linked yet is outlined as its own "island", and connecting a district
merges its islands into one. Open slots are drawn as whole puzzle shapes, without their
insides. You start from one of 3 offered bottom puzzles (groups of individual places).
After that you can build any bottom puzzle on the **frontier** (one bordering what
you've built; tapping any slot on the map picks it), or **connect** a higher puzzle
once everything inside it is built, all the way up to the county. Building the groups
*into* their district is the point (Dave), so the 3 offered cards favour finishing
the current district, then its region, plus one wildcard. That way a "🔗 Connect"
comes along every few builds instead of the map sprawling. `state.js` holds the
rules. `test/campaign.test.js` proves the campaign is finishable from every start.
The campaign plays the same `Board` with `{ book: store.campaign, campaign: true }`:
there's no zooming or context navigation, and solving offers "🗺️ Back to the map".
The campaign keeps its own ledger (`store.campaign`), separate from Explore's
progress.
**The journey (Oct 2026, prototype: chapter 1 written).** Playtest: Rebuild LA was
addicting, but picking where to go next confused people (they expected to go
straight on), and Freeways lacked a tutorial and used places nobody knew. So the
campaign is now a fixed **journey** of steps (`src/campaign/chapters.js`, plain data):
build a cluster, build another, **drive between them by freeway**, connect the
district, and so on outward. The drive uses places you just built, so you know them.
The first drive is one arrow with the jigsaw's `Coach` finger demo, and later ones
grow to two and three arrows. A solved puzzle or drive shows **only Next ▶** (no tips or name chips, per Dave).
Next pulls the camera back out of that area onto the county map, where the new piece
lands. Next there flies out, across and in to the next area before it opens (the
overworld is a camera: `mapview.js`'s `MapView` handles viewBox flights, pan/pinch/wheel,
and names that appear when they fit). Between steps the map is **yours to explore**:
only built places are drawn. Tapping a small one zooms to its group; tapping a big one
opens its place card. After two builds, a wordless finger-tap hint shows this, once,
until you open a card. **Transitions tie it together** (Dave): a campaign
puzzle opens as the group's ONE shape with its name (`Board` `mergeColor`), splits into
its places, then scrambles. Once solved, the places merge back into the named shape. A
drive opens on the real map of the two areas just built, and they shrink into the
start/destination blocks as the grid fades in (`areas` → `playIntro` in
`freeways/game.js`). The overworld shows one big Next card, rings the next
spot, and draws the freeways you've driven as roads. Picking elsewhere is folded under
"Or build somewhere else". After the written steps, the old free-pick campaign carries
on. `journey.js` holds the step state (drives done are kept in `store.campaign`'s
`drives`). `npm run build:freeways` routes each drive step between the two areas
(`driveBetween`: the best-known pair of places that gives a clean drive) into
freeways.json's `campaign` table. `test/journey.test.js` checks the order and the
drives. Freeways' `renderFreeways` takes `{ drive, onSolved, onNext, coach, title }`
for this.

### Freeways — a prototype (Oct 2026; v4: abstract arrows, Dave's redesign)
A third mode from home ("🛣️ Freeways"). Dave on v3 (whole-freeway shapes on a real map):
frustrating. Nobody cares about freeways' exact shapes; what matters is **directionality**
("take this, then this, then this"), and an accurate map is overkill. So v4 is
**abstract**:
- **No map.** Two blocks (start, destination) sit at their rough real relative positions
  on a faint grid.
- **Every freeway on the drive is an ARROW.** It snaps to 8 directions, its length is in
  whole grid steps from the real leg, and its sign rides on it (`arrowsFor` in
  `rules.js`). The tray shows the arrows shuffled and all at one scale, so you can see
  direction and relative length before picking one up.
- **Where is it?** (Dave: an unknown place like Lynwood gives you nothing to hang
  a freeway on.) Each block has a grey caption naming its part of LA (`areaOf` in
  `locator.js`: the top region, or the Eastside / Northeast L.A. where the region would
  mislead). A small county map in the board's emptiest corner (`locator`) puts a
  green and an orange dot on the two places.
- **The puzzle is the chain.** Drag arrows tail-to-tip from the 🚗 to the flag. An arrow
  is pulled in near its spot and clicks in when its tail sits where that freeway really
  starts. The car hops along as the chain grows. A finished drive reads
  "105 west → 405 northwest", plainly (no cheer: Dave found "You made it!" corny).
- **Handling (Dave's round 2):** a touch anywhere near an arrow picks it up (the nearest
  one within `PICK`). On touch the arrow floats `LIFT` above the finger on the jigsaw's
  `Paddle`, held by its middle (the stick meets the arrow's centre), so the thumb
  doesn't hide the spot. A miss just slides the arrow home: **no tips** (Dave dislikes
  them). Once solved, the grid fades out and the
  arrows **morph into the real freeway legs** on the real map (`morphToMap`). That's
  where the abstract chain pays off as geography.
- This is a first cut, meant to iterate on with Dave. Superseded designs (v1 shaped
  pieces; v2 signs on roads with decoys; v3 whole-freeway shapes) live in git history
  before this commit.
- **Data:** `scripts/freeway-routes.mjs` is a **hand-traced schematic**: named
  interchanges plus waypoints, accurate to about 1 km. OSM wasn't reachable from the
  build sandbox, and Natural Earth's roads were too coarse and mislabelled.
  `npm run build:freeways` turns it into a routing graph. The route may start and end on
  any freeway through each place. Switching freeways costs 4 km-equivalent, so the route
  stays on one freeway like a local would. On-ramps must be well inside a place, not on
  a freeway that only clips its corner. The build rejects stub legs (<5 km), routes that
  double back, and 3-freeway hops for short trips. The result is
  `src/data/freeways.json` (90 drives: 2-leg ones to learn on, then 2- and 3-leg ones
  alternating), including the whole network for the shapes.
  `npm run build:freeways -- --through` prints the places each freeway runs through.
  **Check that list after editing a route.**
- **Code:** `src/freeways/`:
  - `rules.js`: pure and unit-tested. `arrowsFor` (legs → chained grid arrows),
    `dirName`, leg order, and helpers kept from v3.
  - `puzzles.js`: the data.
  - `sign.js`: freeway shields. `locator.js`: the county inset and area captions.
  - `game.js`: the board, tray, drag and car. Pointer events are captured on the svg
    root, moves use the CSS transform, and timers go through a Scheduler.
  `store.freeways` is its ledger (`at`). `test/freeways.test.js` checks
  the data (real ends, continuous drives, no decoys, no stub legs) and the rules.
  `scripts/playtest.mjs` lets tester agents play from screenshots: it replays an action list
  and saves a screenshot after each action. Adding `"hold": true` to a drag also captures
  a screenshot mid-drag.

### Modules
- `src/main.js` — entry: home screen (county-map art, Rebuild LA / Explore buttons,
  trophies + progress, build stamp), relaunch to the screen you left (`store.screen()`),
  PWA registration.
- `src/campaign/` — `state.js` (pure-ish campaign rules: `frontier`, `linkable`,
  `offers`, `progress`), `chapters.js` + `journey.js` (the ordered journey and its
  next step), `overworld.js` (the overworld hub: map, Next card, explore) and
  `mapview.js` (its camera).
- `src/pwa.js` — service-worker registration with update checks on focus/visibility and
  every 5 min; vite-plugin-pwa autoUpdate reloads once the new worker takes control.
- `src/jigsaw/` — the mode, in small modules:
  - `index.js` — wiring only: renders one node (chrome + a `Board`), navigation (up,
    breadcrumb, zoom into child), the search fly-through. **Exactly one Board is alive:**
    every render `destroy()`s the previous one first.
  - `board.js` — `Board`: one node's puzzle. Phase machine (`building → solved ⇄ play`,
    transient `intro / scattering / solving / zooming`, terminal `destroyed`), the guided
    run, snapping, camera zoom/collapse, persistence (`serialize`). Talks out only via
    callbacks.
  - `scheduler.js` — every timer / animation frame a Board starts goes through its
    `Scheduler`, so `destroy()` cancels everything (no stale timer can save the wrong
    level or navigate twice).
  - `gestures.js` — pointer input → `grab/drag/drop`, `tap`, `pan/panEnd`, `shake`,
    `pinch`. `pointercancel` aborts (never completes) a gesture.
  - `assembly.js` (pure) — anchor pick, placement order, snap radius, glow strength,
    hint level. `layout.js` (pure) — the board split (tries stacked + side-by-side
    layouts, keeps the biggest map that leaves the tray room for the pieces) and
    `packTray` (pieces placed so labels aren't covered).
  - `geometry.js` — projection of a node's children, label anchor candidates, shared-
    edge (`facingInfo`) and hit tests. `labels.js` — on-piece labels at one uniform size,
    sliding to another interior anchor when they'd collide.
  - `stage.js` — HTML chrome over the SVG: canvas panels, prompt pill, solved tray.
    `fx.js` — edge glow (cached per pair), snap burst, paddle, ghost, coach, collapse
    name. `piece.js` — one piece's SVG + visual state.
  - `tree.js` — read-only access to the generated JSON + `SEARCH_ITEMS`.
    `search.js` — search overlay (results show "group · region"). `card.js` — place
    card (fact, area/pop, tappable "Borders" chips from `neighbors.json`).
    `ui.js` — breadcrumb + Solve / Zoom out button. `stats.js` — area/pop roll-ups.
- `src/ui/` — `dom.js` (`el`/`svgEl`), `modal.js` (accessible dialog: role/aria-modal,
  focus in + trapped + restored, Escape).
- `src/store.js` — localStorage: `progress` (per puzzle: 'solved' | 'skipped'),
  `counts` / `trophies` / `visited` (progression),
  `puzzles` (each level's in-progress run, so leaving and coming back resumes it),
  `nav` (last level), `atHome`, `coached`.
- `src/progress.js` — puzzle counts, the trophy list (`TROPHIES`, each with `earned()`),
  `record(event)` to award + toast, `catchUp()` on load. `src/progressScreen.js` — the
  Progress screen.
- `src/telemetry.js` — GoatCounter (via its no-JS `/count` pixel — no third-party
  script) page view + gameplay events (puzzle-start / -solved /
  -skip, hint-*, zoom-in, card-open, search, js-error), **production only** (never dev
  or webdriver). `src/bugreport.js` — Report-an-issue dialog → Formspree (discloses
  what context it attaches).
- `src/data/` — generated by `npm run build:shapes` (from `regions.js` +
  `boundaries.json`): `hierarchy.json`, `puzzle-shapes.json` (encoded polylines —
  `src/jigsaw/polyline.js`; decoded lazily in `tree.js`), `puzzle-adjacency.json`
  (sibling borders), `neighbors.json` (every place's real neighbours). The build **fails**
  if a puzzle has <3 or >7 pieces, isn't connected, or a group lacks a hand name.
  **Group names teach** — `GROUP_NAMES` in the build script must be accurate: a real
  district name covering the members, else "<best-known member> area"; never a coinage
  named after one small place. `places.js` — card content (approx `pop`, `type`,
  optional `fact` — facts must be verifiably true; fact-checked Oct 2026).
  (Restart `npm run dev` after `build:shapes` — Vite doesn't HMR changed JSON imports.)
- `scripts/` — `build-puzzle-shapes.mjs`, `build-boundaries.mjs`, `icons.mjs`,
  `screenshots.mjs` (drives the whole guided flow + desktop; fails on console errors or
  failed assertions). `test/` — unit tests for the pure modules + data integrity.

**Keep these invariants** (hard-won — see prototype learnings): pointer capture on the
stable SVG root not the dragged piece; clockwise winding for any new boundary data; each
auto-clustered group a single connected component; every level 3–7 pieces.
Animate piece movement via the CSS `transform` **property** (`style.transform`), never the
SVG `transform` **attribute** — only Chromium transitions the attribute, so the attribute
route teleports pieces on iOS Safari/Firefox. Force a reflow between the start and end
transform so the transition actually runs. Every deferred effect goes through the
Board's `Scheduler`, never a bare `setTimeout`/`requestAnimationFrame`.

**Shipping / cache-busting:** assets are content-hashed; `index.html` is network-first
in the service worker (never served stale from precache); the worker skips waiting,
claims clients, and the page reloads when it takes over; update checks run whenever the
app regains focus. The home screen shows `build <commit> · <time>` to confirm.

## Next steps / ideas
See `ROADMAP.md`. Beyond it: keyboard play, neighbour context while zoomed in (ghost
outlines of surrounding areas / a mini-map), the high desert, Card Battle mode.
