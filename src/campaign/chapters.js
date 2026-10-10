// "Rebuild LA" as a journey: the steps, in order, so the next thing to do is
// always obvious (playtest: picking where to go next was confusing). Plain
// data, no imports: the freeway build script reads it too, to route each drive.
//
//   ['build', puzzleId]   build a bottom puzzle (a cluster of places)
//   ['drive', areaA, areaB] drive between two areas you've built, by freeway.
//                         Drives start with one arrow (the tutorial) and grow.
//   ['link', puzzleId]    connect a district/region whose pieces are all built
//
// After the last step, the campaign carries on as before (pick any frontier
// spot). Only chapter 1 is written so far — a prototype to feel the rhythm.
const C = 'Central L.A. › ';
const V = 'San Fernando Valley › ';

export const CHAPTERS = [
  {
    title: 'Central L.A.',
    steps: [
      ['build', `${C}Hollywood area`],
      ['build', `${C}Downtown area`],
      ['drive', `${C}Hollywood area`, `${C}Downtown area`], // the 101 — one arrow
      ['build', `${C}Silver Lake area`],
      ['build', `${C}Mid-Wilshire area`],
      ['drive', `${C}Mid-Wilshire area`, `${C}Downtown area`], // the 10 — one arrow
      ['build', `${C}Koreatown area`],
      ['build', `${C}West Hollywood area`],
      ['link', 'Central L.A.'],
    ],
  },
  {
    title: 'Over the hill to the Valley',
    steps: [
      ['build', `${V}South Valley`],
      ['build', `${V}East Valley`],
      ['drive', `${C}Hollywood area`, `${V}East Valley`], // the 101 → the 170 — two arrows
    ],
  },
];

// A drive's key in freeways.json's `campaign` table.
export const driveKey = (a, b) => `${a} ⇒ ${b}`;
