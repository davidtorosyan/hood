// Jigsaw puzzle sets: small groups of adjacent neighborhoods the player
// assembles by dragging labeled pieces into their correct relative positions.
// Each `members` name must exist in boundaries.json (we render its real, lightly
// simplified polygon). Keep groups to 4–6 truly adjacent neighborhoods so the
// spatial relationships are clean and learnable.
export const PUZZLES = [
  {
    id: 'regions',
    title: 'LA regions',
    blurb: 'The big picture — fit the top-level regions of LA together.',
    // `members` are region names; their shapes are the union of each region's
    // neighborhoods (see src/data/regions.js). regionPuzzle drives the build.
    regionPuzzle: true,
    fit: 440, // big pieces — assemble smaller so they scatter without piling up
    members: ['San Fernando Valley', 'Northeast LA', 'Eastside', 'Central LA', 'Westside', 'South LA'],
  },
  {
    id: 'nela',
    title: 'Northeast LA',
    blurb: 'The NELA corridor — assemble the pieces around the river and the hills.',
    members: ['Highland Park', 'Eagle Rock', 'Glassell Park', 'Mount Washington', 'Cypress Park'],
  },
  {
    id: 'eastside-hills',
    title: 'Eastside hills',
    blurb: 'Silver Lake, Echo Park and the river-side neighborhoods below Griffith Park.',
    members: ['Silver Lake', 'Echo Park', 'Los Feliz', 'Atwater Village', 'Elysian Valley'],
  },
  {
    id: 'westside',
    title: 'The Westside',
    blurb: 'From the beach at Venice inland through the 405 neighborhoods.',
    members: ['Venice', 'Mar Vista', 'Palms', 'Sawtelle', 'West Los Angeles', 'Westwood'],
  },
  {
    id: 'valley',
    title: 'The Valley',
    blurb: 'The east San Fernando Valley along Ventura Blvd and beyond.',
    members: ['Sherman Oaks', 'Studio City', 'Van Nuys', 'Valley Glen', 'Valley Village', 'North Hollywood'],
  },
];
