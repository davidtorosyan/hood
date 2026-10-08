# Rebuild LA: matching Explore's structure (parked idea)

**Status:** parked by Dave, Oct 2026, to think about later. Nothing here is built yet.

## Dave's picture
Play the campaign with the same structure as the Explore map. Combine neighborhoods into
a group, then solve the larger puzzle that group sits in, and keep going up.

## Where the current campaign stands
The mechanic is already there. Rebuild LA plays exactly the Explore puzzles, in reverse
order:
- "Build El Monte area" is the bottom Explore level: neighborhoods combine into a group.
- "Connect West San Gabriel" is the level above: the groups you built are its pieces.
- The same pattern continues up through regions to the county.

What's missing is the *feel* of the structure:
- Before build 7db0a18, the order was random across the whole frontier, so a Connect
  almost never came up.
- Even with offers now biased toward finishing a district, the overworld is a flat map
  of all places. The hierarchy you're climbing stays hidden.

## Options
**A. One district at a time (small change).**
- Pick a district that borders what you've built.
- The game walks you through its groups, then its Connect, then the next district.
- Once a region's districts are all done, you connect the region.
- It keeps the current overworld, but with one active project at a time instead of
  three loose offers.
- About a day of work, mostly `state.js` and the cards.

**B. The campaign *is* the Explore map, fogged (bigger, better; my recommendation).**
- Rebuild LA uses Explore's zoomable map and breadcrumb.
- At the county level the 7 regions are empty outlines. Tap one to zoom into its
  districts (also outlines). Tap a district to see its groups. Tap a group to play its
  neighborhoods.
- Once every group in a district is built, the district's puzzle unlocks right there:
  the outlines you zoomed through become pieces you assemble.
- Zooming out shows your progress filling in at every level.
- The result is one map and one mental model. The zoom-in, build, zoom-out, connect loop
  *is* the recursive structure.
- The frontier rule is optional. "The next district must border what you've built" keeps
  the growing-outward feel; or let players start anywhere.
- Cost:
  - `Board` needs a "not built yet" piece look: an empty outline you can zoom into but
    not drag.
  - Parent puzzles need a lock until their children are built.
  - Navigation, zoom and neighbor context are reused.
  - The separate overworld mostly goes away, or shrinks to a county summary.
- Risk: the two modes could feel too similar. They differ by fog and order: you only
  see what you've rebuilt, and parents unlock bottom-up.

## Quirks to plan around (either option)
- Two puzzles mix groups with raw neighborhoods: North Valley and Westside & Coast.
  Their raw neighborhoods get placed directly in the larger puzzle.
- Depth varies. Some groups sit directly under a region with no district in between.
