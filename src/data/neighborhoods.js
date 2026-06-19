// Curated Phase-1 quiz set: well-known City-of-LA neighborhoods spread across
// the city's regions. `name` MUST match a feature name in boundaries.json.
//
// size: S (<25k), M (25k–75k), L (>75k). `population` is approximate and
// rounded — flagged for verification in the research-fill pass (see CLAUDE.md).
// history/landmark are intentionally one-liners: this is the reveal card text.

export const REGIONS = {
  CENTRAL: 'Central LA',
  EASTSIDE: 'Eastside',
  WESTSIDE: 'Westside',
  SOUTH: 'South LA',
  VALLEY: 'San Fernando Valley',
  HARBOR: 'Harbor',
};

export const NEIGHBORHOODS = [
  {
    name: 'Hollywood',
    region: REGIONS.CENTRAL,
    size: 'L',
    population: 80000,
    history:
      'Birthplace of the American film industry — studios arrived in the 1910s and the name became shorthand for the movies worldwide.',
    landmark: 'The Walk of Fame and the TCL Chinese Theatre.',
  },
  {
    name: 'Downtown',
    region: REGIONS.CENTRAL,
    size: 'M',
    population: 28000,
    history:
      "LA's historic core and civic center — hollowed out for decades, then repopulated by a loft and high-rise boom.",
    landmark: 'Walt Disney Concert Hall and LA City Hall.',
  },
  {
    name: 'Koreatown',
    region: REGIONS.CENTRAL,
    size: 'L',
    population: 120000,
    history:
      "A dense, multi-ethnic district that became the heart of LA's Korean community after the 1960s — among the most crowded neighborhoods in the city.",
    landmark: 'Wall-to-wall Korean BBQ, 24-hour spas, and the Wiltern theater.',
  },
  {
    name: 'Mid-Wilshire',
    region: REGIONS.CENTRAL,
    size: 'M',
    population: 30000,
    history:
      "Home to the 'Miracle Mile,' the 1920s stretch of Wilshire Blvd designed to be seen — and shopped — from a moving car.",
    landmark: 'LACMA and the La Brea Tar Pits.',
  },
  {
    name: 'Echo Park',
    region: REGIONS.EASTSIDE,
    size: 'M',
    population: 40000,
    history:
      "A working-class hub just west of Downtown, long a center of LA's Latino and activist communities.",
    landmark: 'Echo Park Lake, famous for its lotus blossoms and paddle boats.',
  },
  {
    name: 'Silver Lake',
    region: REGIONS.EASTSIDE,
    size: 'M',
    population: 33000,
    history:
      'Built around a 1900s reservoir, it grew from a modernist-architecture haven into a byword for LA hipster culture.',
    landmark: 'The Silver Lake Reservoir and the staircases threading its hills.',
  },
  {
    name: 'Los Feliz',
    region: REGIONS.EASTSIDE,
    size: 'M',
    population: 37000,
    history:
      'A hillside neighborhood of grand estates below Griffith Park, long popular with Hollywood figures.',
    landmark: 'The Griffith Observatory on the hills above it.',
  },
  {
    name: 'Highland Park',
    region: REGIONS.EASTSIDE,
    size: 'M',
    population: 57000,
    history:
      'One of LA\'s oldest northeast neighborhoods — Craftsman homes and Latino heritage, now heavily gentrified along Figueroa and York.',
    landmark: 'The historic Highland Park Bowl and York Boulevard.',
  },
  {
    name: 'Boyle Heights',
    region: REGIONS.EASTSIDE,
    size: 'L',
    population: 92000,
    history:
      'East of the LA River — historically a port of entry for Jewish, Japanese, and today predominantly Mexican-American communities.',
    landmark: 'Mariachi Plaza, where mariachis have gathered for hire since the 1930s.',
  },
  {
    name: 'Chinatown',
    region: REGIONS.EASTSIDE,
    size: 'S',
    population: 20000,
    history:
      "Relocated in the 1930s to make way for Union Station, 'New Chinatown' became a cultural anchor for Chinese Angelenos.",
    landmark: "Central Plaza's neon gateway and its dim sum houses.",
  },
  {
    name: 'Venice',
    region: REGIONS.WESTSIDE,
    size: 'M',
    population: 40000,
    history:
      "Built by tobacco millionaire Abbot Kinney in 1905 as 'Venice of America,' complete with canals dug to mimic the Italian city.",
    landmark: 'The Venice Boardwalk and the surviving canals.',
  },
  {
    name: 'Westwood',
    region: REGIONS.WESTSIDE,
    size: 'M',
    population: 50000,
    history:
      'A 1920s master-planned village that grew up around UCLA, anchoring the Westside.',
    landmark: 'The UCLA campus and the Hammer Museum.',
  },
  {
    name: 'Pacific Palisades',
    region: REGIONS.WESTSIDE,
    size: 'M',
    population: 27000,
    history:
      'An affluent seaside enclave between the Santa Monica Mountains and the ocean, founded by Methodists in 1922.',
    landmark: 'The Getty Villa and Will Rogers State Historic Park.',
  },
  {
    name: 'Watts',
    region: REGIONS.SOUTH,
    size: 'M',
    population: 42000,
    history:
      'A historically Black neighborhood in South LA, flashpoint of the 1965 uprising, known for its deep musical and civil-rights legacy.',
    landmark: "The Watts Towers, hand-built over 33 years by Sabato 'Simon' Rodia.",
  },
  {
    name: 'Leimert Park',
    region: REGIONS.SOUTH,
    size: 'S',
    population: 12000,
    history:
      'A planned 1920s community that became the cultural heart of Black Los Angeles — rich in jazz, art, and Afrocentric commerce.',
    landmark: 'Leimert Park Village and the World Stage performance space.',
  },
  {
    name: 'Sherman Oaks',
    region: REGIONS.VALLEY,
    size: 'M',
    population: 74000,
    history:
      'A leafy, prosperous San Fernando Valley suburb that boomed after World War II.',
    landmark: "The Sherman Oaks Galleria, immortalized in 1980s 'Valley girl' culture.",
  },
  {
    name: 'Van Nuys',
    region: REGIONS.VALLEY,
    size: 'L',
    population: 105000,
    history:
      'The civic and industrial heart of the San Fernando Valley, and one of its oldest, most populous districts.',
    landmark: 'The Van Nuys Civic Center and the historic Valley Municipal Building.',
  },
  {
    name: 'Northridge',
    region: REGIONS.VALLEY,
    size: 'M',
    population: 60000,
    history:
      'A Valley suburb known far beyond LA for the devastating 1994 earthquake centered nearby.',
    landmark: 'Cal State Northridge (CSUN).',
  },
  {
    name: 'San Pedro',
    region: REGIONS.HARBOR,
    size: 'L',
    population: 80000,
    history:
      "LA's harbor town — home to the Port of Los Angeles and generations of fishing and longshore families.",
    landmark: 'The Port of Los Angeles and the Korean Friendship Bell.',
  },
];

export const NEIGHBORHOODS_BY_NAME = Object.fromEntries(
  NEIGHBORHOODS.map((n) => [n.name, n]),
);
