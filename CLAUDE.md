# Hood — rewrite charter

A mobile-first, installable web game for **learning the neighborhoods of Los Angeles** by
building a mental map: not memorizing exact boundaries, but learning what region a place is
in, what it's near, and where it sits. Hosted as a static site on **GitHub Pages**, no
backend, light state in localStorage.

> **This is a clean-slate rewrite.** A prototype (the `prototypes` branch) explored the
> design and proved out the fun. This `main` branch starts empty — just this charter — and
> we build the real thing from scratch. **No implementation code exists yet, and none should
> be added until we start the build session.** This commit is only the plan + git scaffolding.

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
- **Phase 1:** City of LA neighborhoods (data already in `prototypes`), the zoomable Jigsaw
  done well.
- **Phase 2 (Dave's real goal):** all of **LA County** — Glendale, Santa Monica, Pasadena,
  etc. Needs additional boundary sources beyond the City-of-LA set.

## Start-of-build checklist (next session)
1. Read the `prototypes` branch `CLAUDE.md` (full design history + playtesting learnings +
   technical gotchas: pointer-capture, winding-order, connected partitions).
2. Decide the stack and scaffold the project (package.json, build tool, PWA, dev server).
3. Pull the boundary data + generated geometry from `prototypes` (see commands above).
4. Build the zoomable Jigsaw from scratch with a clean architecture.

> Local note: the working tree may still contain ignored, stale prototype artifacts
> (`node_modules/`, `dist/`) — regenerate or delete as needed; they are not tracked here.
