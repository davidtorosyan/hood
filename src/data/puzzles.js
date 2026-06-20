// Jigsaw puzzle sets: small groups of adjacent neighborhoods the player
// assembles by dragging labeled pieces into their correct relative positions.
// Each `members` name must exist in boundaries.json (we render its real, lightly
// simplified polygon). Keep groups to 4–6 truly adjacent neighborhoods so the
// spatial relationships are clean and learnable.
export const PUZZLES = [
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
