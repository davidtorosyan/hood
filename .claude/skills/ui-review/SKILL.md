---
name: ui-review
description: Screenshot-and-critique loop for Hood's UI. Run this after EVERY change that affects the interface (layout, CSS, components, copy, map rendering). Drives the app at a phone viewport, captures screenshots, evaluates them for problems, fixes them, and re-shoots until clean.
---

# UI Review Loop

Hood is mobile-first. Dave does not want to be the first line of defense for visual
bugs — you are. After any UI-affecting change, run this loop before reporting done.

## Steps

1. **Make sure the dev server is running.** Check `.vite-dev.log` for the active URL
   (the port drifts, e.g. `http://localhost:5175/hood/`). If it isn't running, start it:
   `npm run dev > .vite-dev.log 2>&1 &` then read the log for the port.

2. **Capture.** Run the harness, passing the live URL if it isn't the default:
   `node scripts/screenshots.mjs http://localhost:<port>/hood/`
   It drives a full Jigsaw session (home → pan the solved map → shake-scramble → assemble
   with the connection glow → pinch zoom in/out → tap-zoom → dive to a leaf → open a
   neighborhood card) at an iPhone viewport, writes labeled PNGs to `.ui-review/`, and
   **fails on any console error or a failed gesture/state assertion** — treat a non-zero
   exit as a bug to fix first. If it logs `UNPLACED after solve`, a piece wouldn't snap —
   investigate (adjacency data or snap logic) before judging visuals.

3. **Evaluate.** Read every screenshot in `.ui-review/` and critique like a designer.
   Look for:
   - Clipping / overflow / content pushed off-screen (the board fills the screen and
     nothing scrolls; the banner, breadcrumb, and board must all be fully visible).
   - Tap targets too small (< ~44px), cramped spacing, misalignment.
   - Contrast and legibility: piece labels need a strong white halo and must fit their
     piece; placed pieces should be distinct pastels, loose pieces gray.
   - The map: is LA's shape recognizable? Do assembled pieces tile cleanly? Is the
     zoomable hint (faint inner subdivisions) subtle, not noisy?
   - Visual hierarchy: is the thing the player must act on the most prominent?

4. **Fix** the concrete problems you found.

5. **Re-shoot and compare.** Re-run the harness and confirm each issue is resolved and
   nothing regressed. Repeat until the screens are clean.

## Notes
- Add screens to the flow in `scripts/screenshots.mjs` when you add new UI states
  (e.g. the results screen, settings) so they get reviewed too.
- `.ui-review/` is gitignored working output — don't commit it.
- Report a short summary of what you found and fixed, not a screenshot dump.
