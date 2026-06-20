// Jigsaw puzzle sets. The "regions" puzzle is the top of a drill-down: solve it,
// then zoom into a region to assemble that region's own neighborhoods.
//
// Each `members` name must resolve to a shape: neighborhood names come from
// boundaries.json; region names (regionPuzzle) are unions of their neighborhoods
// (see src/data/regions.js). Child puzzles are subsets of their region so the
// zoom-in is geographically honest. Keep groups to ~4–6 truly adjacent pieces.
export const PUZZLES = [
  {
    id: 'regions',
    title: 'LA regions',
    blurb: 'The big picture — fit the top-level regions of LA together.',
    regionPuzzle: true,
    fit: 440, // big pieces — assemble smaller so they scatter without piling up
    members: ['San Fernando Valley', 'Northeast LA', 'Eastside', 'Central LA', 'Westside', 'South LA'],
    children: {
      'San Fernando Valley': 'valley',
      'Northeast LA': 'nela',
      Eastside: 'eastside',
      'Central LA': 'central',
      Westside: 'westside',
      'South LA': 'south',
    },
  },
  {
    id: 'valley',
    title: 'San Fernando Valley',
    parent: 'regions',
    blurb: 'Ventura Blvd and the east Valley.',
    members: ['Sherman Oaks', 'Studio City', 'North Hollywood', 'Valley Village', 'Valley Glen', 'Van Nuys'],
  },
  {
    id: 'nela',
    title: 'Northeast LA',
    parent: 'regions',
    blurb: 'The NELA corridor, by the river and the hills.',
    members: ['Highland Park', 'Eagle Rock', 'Glassell Park', 'Mount Washington', 'Cypress Park'],
  },
  {
    id: 'eastside',
    title: 'Eastside',
    parent: 'regions',
    blurb: 'East of the river.',
    members: ['Boyle Heights', 'Lincoln Heights', 'El Sereno', 'Montecito Heights'],
  },
  {
    id: 'central',
    title: 'Central LA',
    parent: 'regions',
    blurb: 'Hollywood and the Eastside hills.',
    members: ['Hollywood', 'East Hollywood', 'Los Feliz', 'Silver Lake', 'Echo Park'],
  },
  {
    id: 'westside',
    title: 'Westside',
    parent: 'regions',
    blurb: 'From the beach at Venice inland through the 405.',
    members: ['Venice', 'Mar Vista', 'Palms', 'Sawtelle', 'West Los Angeles', 'Westwood'],
  },
  {
    id: 'south',
    title: 'South LA',
    parent: 'regions',
    blurb: 'The Crenshaw and West Adams area.',
    members: ['Exposition Park', 'Jefferson Park', 'West Adams', 'Leimert Park', 'Baldwin Hills/Crenshaw', 'Hyde Park'],
  },
];

export const PUZZLE_BY_ID = Object.fromEntries(PUZZLES.map((p) => [p.id, p]));
