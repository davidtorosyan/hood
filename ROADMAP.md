# Hood roadmap

Built from the October 2026 review: code, product and UX, plus Dave's playtest notes.
Items are checked off as they land on `main`, which deploys straight to GitHub Pages.

## Playtest notes from Dave (drive the priorities)
1. **Getting started is hard.** Players take a while to find Scramble. Once the pieces
   are loose, they pick one up, drop it, pick up another, and never push through to
   figure out where one piece goes.
2. **Players ignore the names.** You can solve everything from the shapes alone. The
   point of the game is learning the names, so play has to make you read them.

## Batch 2: Dave's playtest of the guided build
- [x] **Quieter prompt after the tutorial.** The bold "Place ▸ X" pill stays for the
      coached first run. After that the ask is a subtle, persistent line that's still
      easy to read at a glance.
- [x] **Zoom out mid-puzzle.** Zoom out is always available below the county, not
      only once the map is solved. The in-progress puzzle is saved, so coming back
      resumes it, and the parent map marks it as in progress.
- [x] **Neighbor context.** When zoomed in, the surrounding areas show as faint
      named outlines around the map, so you see where you are. Tapping one goes
      there.
- [x] **Progression and trophies.**
  - A Progress screen with overall and per-region puzzle counts.
  - A shelf of light, friendly trophies: first piece, first map, each region
    completed, flawless solves, curiosity (cards, neighbor hops), and milestones.
  - A small "🏆 unlocked" toast when you earn one.
  - Region progress shown on solved boards.
- [ ] **Items from the first review I'd deferred or dropped:**
  - Smaller map data
  - Pinch-to-zoom accessibility (`user-scalable=no`)
  - Lint/format setup
  - Integrity hash on the analytics script
  - Facts for the ~85 places without one
  - Keyboard play stays in "Later"

## 1. Guided placement: the core design change
Each puzzle starts the same way: one **anchor** piece sits on the map and the rest wait
in the tray. Instead of free-for-all dragging, the game asks for **one piece at a time
by name**, for example "Place **Burbank**".

- [x] **Order generation.** Build a random order outward from the anchor, where every
      next piece borders something already placed. Each group is one connected
      component, so this always succeeds. The anchor is picked at random, so the
      county puzzle doesn't always start with South L.A.
- [x] **Only the asked-for piece can be picked up.** Grabbing another piece makes it
      wiggle and says its name ("That's Glendale. Find Burbank"), which teaches a
      name either way.
- [x] **Prompt UI.** A prominent "Place ▸ Burbank" pill between the map and the tray.
      It shows progress (3 / 6) and pops in on each new piece.
- [x] **Escalating hints after misses.** Miss 1: nothing, just try again. Miss 2: name a
      placed neighbor ("Burbank borders Glendale") and pulse that neighbor on the map.
      Miss 3 or later: a dashed ghost outline shows where it goes. The game stays
      forgiving and never gets stuck.
- [x] **Puzzles start themselves.** A level you haven't solved shows assembled for a
      beat, then breaks apart into play, so nobody has to find Scramble. Levels you've
      already solved open assembled for browsing and offer a small **Play again**.
- [x] **First-run coaching.** The first placement ever shows an animated finger
      dragging the piece toward the map, and the prompt spells out "drag it up onto
      the map".
- [x] **Light progress.** Remember which puzzles you've solved, mark them with a
      subtle ✓ on the map, and put **Continue** plus "N of M puzzles solved" on the
      home screen. No streaks, no scores.

## 2. Bugs (correctness)
- [x] **Resume crash.** A reload mid-scramble lost the pieces' tray spots, so a drop
      that missed threw `moveTo(undefined)`.
- [x] **Stale boards outlive navigation.** Timers and animations kept running and
      could save the wrong level or navigate twice. Fix: `Board.destroy()`, and every
      timer and animation frame goes through one cancellable scheduler.
- [x] **Zoom and collapse can't be cancelled.** They raced ↑, breadcrumb taps and the
      search fly-through.
- [x] **`pointercancel` treated as `pointerup`.** An interrupted touch, such as an iOS
      system gesture or an incoming call, could count as a tap or a drop. *(Touch
      itself works fine. This is only about the cancel event.)*
- [x] **Search threw away an in-progress puzzle.** It now asks for nothing and keeps
      the scramble saved for that level.

### Found in the second review round (all fixed)
- [x] A resumed puzzle had no Solve button, and its pieces could restore off-screen
      after a rotation or window resize. Tray spots are now re-packed on restore.
- [x] Rotating or resizing mid-level now re-lays the level out.
- [x] Double-tapping Solve could turn into Zoom out. The button now disables
      mid-animation, and Solve also works during the intro.
- [x] Leaving right after the final snap could keep a stale in-progress save.
- [x] The next piece could be grabbed in the beat before it was asked for.
- [x] An offline launch right after install had no app shell (the page cache is now
      warmed on registration).
- [x] Bug reports always said "solved".

## 3. Content (what the game teaches)
- [x] **Hand-name all 61 groups.** The auto-derived names taught wrong geography:
      "Holmby Hills" contained Beverly Hills and Westwood, "Bunker Hill" was all of
      Downtown, "Santa Fe Dam" was Monrovia. Use plain, recognizable names.
- [x] **Fact-check the card facts.** Remove or rewrite doubtful claims, such as the
      Canoga Park "Cheesecake Factory test kitchen" and Granada Hills "Sleepless in
      Seattle". A wrong fact poisons the rest.
- [x] **Cards show what the place borders.** The neighbors list reinforces the mental
      map, and the names can be tapped.

## 4. UX
- [x] **Map size.** The build canvas is sized to the map's real aspect ratio, so wide
      maps aren't letterboxed. The tray gets the rest of the space, so tray pieces
      stop overlapping.
- [x] **Label collisions.** Overlapping on-piece labels are nudged apart, as with
      "Westside" and "Central L.A.".
- [x] **Header.** Drop the meaningless "Jigsaw" title so the breadcrumb leads.
      Replace the bare "↑" with a labeled "Zoom out" or "Home" button.
- [x] **"Report an issue"** no longer overlaps the board.
- [x] **Home screen.** Show a real LA map silhouette instead of the 🧩 emoji, plus
      Continue and progress.
- [x] **Search results** show the full path ("Pasadena · Pasadena area · San Gabriel
      Valley").
- [x] **Solved-state tray.** Less dead space. It shows what to do next and Play again.

## 5. Code health
- [x] **Split `board.js`** (1,050 lines): gestures, camera, clusters/order (pure),
      effects, tray.
- [x] **Remove dead code and data.**
  - Simple-mode shapes (63KB shipped but unused)
  - Unused store APIs, `pieceBox`, `inner` paths, the callout label branch, the unwired
    `onHint`/`onSolved` callbacks
  - Duplicated mate-search code
- [x] **Tests.** `node --test` for the pure modules (placement order, label layout,
      geometry, store), run in CI before deploy.
- [x] **`build:shapes` fails loudly** on piece-count or connectivity violations.
- [x] **Screenshot harness** accepts `CHROMIUM_PATH` for environments whose Playwright
      version doesn't match.
- [x] **Update CLAUDE.md** to match reality: labels, piece cap, telemetry, the new
      flow.

## 6. Shipping and caching (Dave must always get the latest build)
- [x] **Service worker update flow.**
  - `skipWaiting` + `clientsClaim`
  - Register through `virtual:pwa-register` and reload once a new SW takes control
  - Check for updates on every app focus (`visibilitychange`) and every few minutes
  - Saved game state restores after the reload
- [x] **Never precache-serve a stale `index.html`.** Navigations go network-first
      with a short timeout, falling back to cache offline.
- [x] **Visible build stamp** (short commit plus date) in small print on the home
      screen, so "am I on the latest?" takes one glance.
- [x] **Hashed asset filenames** (Vite default) and `sw.js` fetched with
      `updateViaCache: 'none'`.

## 7. Accessibility, telemetry, performance
- [x] Respect `prefers-reduced-motion`.
- [x] Dialogs (card, search, report): `role=dialog`, `aria-modal`, focus moved in and
      restored on close. Toasts and the prompt get `aria-live`.
- [x] Contrast: the tip and report-link text meet about 4.5:1.
- [x] **Telemetry.**
  - Count gameplay events: puzzle started/solved, hints used, zoom in, card opened,
    search used
  - Production only, not in dev or the screenshot harness
- [x] **Glow cost.** Cache the shared-edge computation for each (source, target) pair
      instead of about 76k segment checks on every finger move.

## Later / ideas
- Keyboard play (tab to the asked-for piece, arrow keys to the slot). Today the game
  needs touch or a mouse.
- Card Battle mode (from the prototype), once the Jigsaw feels finished.
- Smaller data: quantized TopoJSON or lazy-loading the shapes.
