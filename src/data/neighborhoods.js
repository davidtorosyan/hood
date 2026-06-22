// The learning content. Each card models a neighborhood the way the game teaches
// it: not by exact boundary, but by region, what it's near, what anchors it, its
// identity, what it's confused with, and a one-line mental hook.
//
// `name` matches a feature in boundaries.json so we can compute proximity
// ("which is closer to Downtown?") from centroids without ever showing a big map.
// `nearby` may include real places outside our card set (Glendale, Culver City…)
// for realism; only names that ARE cards get used as quiz options.
//
// Populations/sizes are intentionally omitted here — this redesign is about
// relative location and identity, not census trivia.

export const REGIONS = [
  'Northeast LA',
  'Eastside',
  'Central LA',
  'Hollywood',
  'Westside',
  'San Fernando Valley',
  'South LA',
  'Harbor',
];

// Cluster id -> friendly label. Clusters are the "these belong together" groupings
// used by Build the Cluster and by relatedness questions.
export const CLUSTERS = {
  nela: 'Northeast LA',
  'east-hip': 'Eastside (Silver Lake side)',
  central: 'Central LA',
  'eastside-river': 'Eastside (east of the river)',
  'westside-inland': 'Westside (inland)',
  'westside-coast': 'Westside (coast)',
  'valley-east': 'East San Fernando Valley',
  south: 'South LA',
  harbor: 'Harbor',
};

export const NEIGHBORHOODS = [
  // ---- Northeast LA cluster (the rich starter cluster) --------------------
  {
    name: 'Highland Park',
    region: 'Northeast LA',
    cluster: 'nela',
    nearby: ['Eagle Rock', 'Mount Washington', 'Glassell Park', 'Cypress Park', 'South Pasadena'],
    anchors: ['York Boulevard', 'Figueroa Street', 'Arroyo Seco Parkway (110)', 'Highland Park Bowl'],
    identity:
      'The working-class, historically Chicano heart of Northeast LA — now one of the most gentrified neighborhoods in the city, with vintage shops, bars and restaurants along York and Figueroa.',
    confusions: ['Eagle Rock', 'Glassell Park'],
    hook: 'The York/Figueroa corridor, between Eagle Rock and the river side of NELA.',
  },
  {
    name: 'Eagle Rock',
    region: 'Northeast LA',
    cluster: 'nela',
    nearby: ['Highland Park', 'Glassell Park', 'Glendale', 'Pasadena'],
    anchors: ['Colorado Boulevard', 'the Eagle Rock itself', 'Occidental College', 'the 134 freeway'],
    identity:
      'A leafy, family-friendly NELA neighborhood wedged against Glendale and Pasadena, named for a rock with an eagle-shaped shadow; Colorado Blvd is its spine.',
    confusions: ['Highland Park'],
    hook: "NELA's Glendale/Pasadena-adjacent corner — Colorado Blvd and Occidental College.",
  },
  {
    name: 'Glassell Park',
    region: 'Northeast LA',
    cluster: 'nela',
    nearby: ['Cypress Park', 'Mount Washington', 'Highland Park', 'Eagle Rock', 'Atwater Village'],
    anchors: ['San Fernando Road', 'Verdugo Road', 'the 2 freeway', 'the LA River'],
    identity:
      'A hilly, industrial-edged NELA neighborhood along the river and San Fernando Road, sitting between Cypress Park and Eagle Rock and gentrifying steadily.',
    confusions: ['Cypress Park', 'Mount Washington'],
    hook: 'Between Cypress Park and Eagle Rock along San Fernando Rd and the river.',
  },
  {
    name: 'Mount Washington',
    region: 'Northeast LA',
    cluster: 'nela',
    nearby: ['Highland Park', 'Cypress Park', 'Glassell Park', 'Eagle Rock'],
    anchors: ['the San Rafael Hills', 'Self-Realization Fellowship', 'the Southwest Museum', 'the Arroyo Seco'],
    identity:
      'A steep hillside enclave rising above Highland Park and Cypress Park — winding roads, big views, and a quiet, woodsy feel.',
    confusions: ['Highland Park'],
    hook: 'The hill that rises above Highland Park and Cypress Park.',
  },
  {
    name: 'Cypress Park',
    region: 'Northeast LA',
    cluster: 'nela',
    nearby: ['Glassell Park', 'Mount Washington', 'Lincoln Heights', 'Elysian Valley', 'Highland Park'],
    anchors: ['San Fernando Road', 'the LA River', 'Rio de Los Angeles State Park', 'the 110'],
    identity:
      'A small, older working-class NELA neighborhood hugging the LA River between Glassell Park and Lincoln Heights.',
    confusions: ['Glassell Park', 'Lincoln Heights'],
    hook: 'River-side NELA between Glassell Park and Lincoln Heights.',
  },
  {
    name: 'Atwater Village',
    region: 'Northeast LA',
    cluster: 'nela',
    nearby: ['Glendale', 'Los Feliz', 'Silver Lake', 'Glassell Park', 'Griffith Park'],
    anchors: ['Glendale Boulevard', 'the LA River', 'the 2 and 5 freeways', 'Griffith Park across the river'],
    identity:
      'A walkable, river-adjacent neighborhood between Los Feliz, Silver Lake, Glendale and Glassell Park — understood through the LA River and its closeness to Griffith Park.',
    confusions: ['Silver Lake', 'Los Feliz'],
    hook: 'The east bank of the river, between Los Feliz/Silver Lake and Glendale.',
  },
  {
    name: 'Lincoln Heights',
    region: 'Northeast LA',
    cluster: 'nela',
    nearby: ['Cypress Park', 'Chinatown', 'Boyle Heights', 'El Sereno', 'Montecito Heights'],
    anchors: ['North Broadway', 'the LA River', 'the 5 freeway', 'Lincoln Park'],
    identity:
      "One of LA's oldest neighborhoods, just northeast of Downtown across the river — historically Latino and working-class.",
    confusions: ['Boyle Heights', 'Cypress Park'],
    hook: 'Oldest NELA neighborhood, just across the river from Downtown/Chinatown.',
  },
  {
    name: 'El Sereno',
    region: 'Northeast LA',
    cluster: 'nela',
    nearby: ['Lincoln Heights', 'Boyle Heights', 'Alhambra', 'South Pasadena', 'Montecito Heights'],
    anchors: ['Huntington Drive', 'Cal State LA nearby', 'the 10 and 710 freeways'],
    identity:
      'A quiet, predominantly Latino neighborhood on the eastern edge of NELA, blending toward Alhambra and South Pasadena.',
    confusions: ['Lincoln Heights'],
    hook: 'The eastern edge of NELA, toward Alhambra.',
  },

  // ---- Eastside (Silver Lake side) ---------------------------------------
  {
    name: 'Silver Lake',
    region: 'Eastside',
    cluster: 'east-hip',
    nearby: ['Echo Park', 'Los Feliz', 'Atwater Village', 'East Hollywood'],
    anchors: ['Sunset Boulevard', 'the Silver Lake Reservoir', 'Sunset Junction', 'the hillside staircases'],
    identity:
      'A hilly, design-conscious Eastside neighborhood around its reservoir — a byword for LA hipster culture.',
    confusions: ['Echo Park', 'Los Feliz'],
    hook: 'Reservoir + Sunset Junction, between Echo Park and Los Feliz.',
  },
  {
    name: 'Echo Park',
    region: 'Eastside',
    cluster: 'east-hip',
    nearby: ['Silver Lake', 'Downtown', 'Chinatown', 'Elysian Park', 'Historic Filipinotown'],
    anchors: ['Echo Park Lake', 'Sunset Boulevard', 'Dodger Stadium / Elysian Park', 'the 101'],
    identity:
      'A historically working-class and Latino hub just west of Downtown, with its lotus-filled lake; heavily gentrified in the last decade.',
    confusions: ['Silver Lake'],
    hook: 'The lotus lake just northwest of Downtown, below Silver Lake.',
  },
  {
    name: 'Los Feliz',
    region: 'Eastside',
    cluster: 'east-hip',
    nearby: ['Silver Lake', 'Atwater Village', 'Hollywood', 'East Hollywood', 'Griffith Park'],
    anchors: ['Griffith Observatory and Park', 'the Vermont and Hillhurst villages', 'the Greek Theatre'],
    identity:
      'An affluent hillside neighborhood below Griffith Park, long popular with Hollywood figures.',
    confusions: ['Silver Lake'],
    hook: 'Below Griffith Park, between Hollywood and Silver Lake.',
  },

  // ---- Central LA ---------------------------------------------------------
  {
    name: 'Downtown',
    region: 'Central LA',
    cluster: 'central',
    nearby: ['Chinatown', 'Boyle Heights', 'Echo Park', 'Arts District', 'Historic Core'],
    anchors: ['City Hall', 'Walt Disney Concert Hall', 'Union Station', 'the freeway interchange'],
    identity:
      "LA's historic core and skyline — civic center, financial district, and a residential boom in old towers and the Arts District.",
    confusions: [],
    hook: "The skyline and City Hall; everything else is described as 'near Downtown'.",
  },
  {
    name: 'Koreatown',
    region: 'Central LA',
    cluster: 'central',
    nearby: ['Mid-Wilshire', 'Westlake', 'Hancock Park', 'East Hollywood'],
    anchors: ['Wilshire Boulevard', 'the Wiltern', 'the Metro Purple/D Line', 'wall-to-wall Korean BBQ'],
    identity:
      'A dense, multi-ethnic district west of Downtown — the heart of Korean LA and one of the most crowded parts of the city.',
    confusions: ['Mid-Wilshire', 'Westlake'],
    hook: 'The dense KBBQ grid along Wilshire, west of Downtown.',
  },
  {
    name: 'Mid-Wilshire',
    region: 'Central LA',
    cluster: 'central',
    nearby: ['Koreatown', 'Hancock Park', 'Fairfax', 'Mid-City'],
    anchors: ['the Miracle Mile', 'LACMA', 'the La Brea Tar Pits', 'Wilshire Boulevard'],
    identity:
      'The Miracle Mile stretch of Wilshire — museums and 1920s commercial grandeur between Koreatown and Fairfax.',
    confusions: ['Mid-City', 'Koreatown'],
    hook: 'Miracle Mile / LACMA on Wilshire.',
  },
  {
    name: 'Hollywood',
    region: 'Hollywood',
    cluster: 'central',
    nearby: ['East Hollywood', 'Los Feliz', 'Hollywood Hills', 'West Hollywood'],
    anchors: ['the Walk of Fame', 'Hollywood & Vine', 'the Chinese Theatre', 'the 101'],
    identity:
      "The tourist heart of the film industry's image — Walk of Fame and theaters, grittier than its myth at street level.",
    confusions: ['West Hollywood', 'East Hollywood'],
    hook: 'The Walk of Fame, below the Hollywood Hills and east of WeHo.',
  },

  // ---- Eastside (east of the river) --------------------------------------
  {
    name: 'Boyle Heights',
    region: 'Eastside',
    cluster: 'eastside-river',
    nearby: ['Downtown', 'Lincoln Heights', 'East LA', 'El Sereno'],
    anchors: ['Mariachi Plaza', 'Cesar Chavez Avenue', '1st Street', 'the river and freeways'],
    identity:
      'A historic immigrant gateway just east of the river — once Jewish and Japanese, now a landmark of Mexican-American LA and its culture.',
    confusions: ['East LA', 'Lincoln Heights'],
    hook: 'Mariachi Plaza, east of the river from Downtown.',
  },

  // ---- Westside (inland) --------------------------------------------------
  {
    name: 'Palms',
    region: 'Westside',
    cluster: 'westside-inland',
    nearby: ['Culver City', 'Mar Vista', 'West Los Angeles', 'Cheviot Hills'],
    anchors: ['National Boulevard', 'the 10 and 405', 'the Metro Expo/E Line'],
    identity:
      'A dense, comparatively affordable Westside neighborhood wedged between Culver City and West LA — lots of apartments and students.',
    confusions: ['Mar Vista', 'Culver City'],
    hook: 'The apartment Westside between Culver City and the 405.',
  },
  {
    name: 'Mar Vista',
    region: 'Westside',
    cluster: 'westside-inland',
    nearby: ['Venice', 'Palms', 'Del Rey', 'West Los Angeles', 'Culver City'],
    anchors: ['Venice Boulevard', 'the 405', 'Mar Vista Hill'],
    identity:
      'A low-key residential Westside neighborhood between Venice and Culver City — increasingly pricey bungalows.',
    confusions: ['Palms', 'Del Rey'],
    hook: 'Residential Westside, inland from Venice.',
  },
  {
    name: 'Sawtelle',
    region: 'Westside',
    cluster: 'westside-inland',
    nearby: ['West Los Angeles', 'Westwood', 'Brentwood', 'Santa Monica'],
    anchors: ['Sawtelle Japantown', 'Sawtelle Boulevard', 'the 405', 'Olympic Boulevard'],
    identity:
      'A Westside neighborhood famous for Sawtelle Japantown — a dense strip of Japanese and broader Asian restaurants and shops near West LA.',
    confusions: ['West Los Angeles'],
    hook: 'Sawtelle Japantown — the Asian food strip by the 405.',
  },
  {
    name: 'West Los Angeles',
    region: 'Westside',
    cluster: 'westside-inland',
    nearby: ['Sawtelle', 'Westwood', 'Palms', 'Century City', 'Santa Monica'],
    anchors: ['Pico and Olympic', 'Sawtelle Boulevard', 'the 405', 'the West LA VA nearby'],
    identity:
      'A catch-all Westside district around Pico/Olympic between Santa Monica and the 405; it contains Sawtelle.',
    confusions: ['Sawtelle', 'Westwood'],
    hook: 'The generic Westside grid around Pico/Olympic by the 405.',
  },
  {
    name: 'Westwood',
    region: 'Westside',
    cluster: 'westside-inland',
    nearby: ['West Los Angeles', 'Sawtelle', 'Bel-Air', 'Century City', 'Brentwood'],
    anchors: ['UCLA', 'Westwood Village', 'the Hammer Museum', 'Wilshire Boulevard'],
    identity: 'A Westside village built around UCLA, anchoring the area north of West LA.',
    confusions: ['West Los Angeles'],
    hook: "UCLA's neighborhood.",
  },

  // ---- Westside (coast) ---------------------------------------------------
  {
    name: 'Venice',
    region: 'Westside',
    cluster: 'westside-coast',
    nearby: ['Santa Monica', 'Marina del Rey', 'Mar Vista', 'Playa del Rey'],
    anchors: ['the Venice Boardwalk', 'the canals', 'Abbot Kinney Boulevard', 'the beach'],
    identity:
      'A bohemian beach neighborhood built on canals in 1905 — boardwalk circus on one side, pricey Abbot Kinney boutiques on the other.',
    confusions: ['Santa Monica'],
    hook: 'Boardwalk and canals, on the beach next to Santa Monica.',
  },
  {
    name: 'Pacific Palisades',
    region: 'Westside',
    cluster: 'westside-coast',
    nearby: ['Santa Monica', 'Brentwood', 'Malibu', 'Topanga'],
    anchors: ['the Getty Villa', 'Will Rogers State Historic Park', 'PCH', 'Palisades Village'],
    identity:
      'An affluent seaside enclave in the Santa Monica Mountains, between Santa Monica and Malibu.',
    confusions: ['Brentwood', 'Malibu'],
    hook: 'Wealthy coastal canyon between Santa Monica and Malibu.',
  },

  // ---- East San Fernando Valley ------------------------------------------
  {
    name: 'Sherman Oaks',
    region: 'San Fernando Valley',
    cluster: 'valley-east',
    nearby: ['Studio City', 'Van Nuys', 'Encino', 'Valley Village'],
    anchors: ['Ventura Boulevard', 'the 101 and 405', 'the Sherman Oaks Galleria'],
    identity:
      "A prosperous, leafy Ventura Blvd Valley neighborhood carrying the '80s Galleria 'Valley girl' image.",
    confusions: ['Studio City', 'Encino'],
    hook: 'Ventura Blvd + the Galleria, south-central Valley.',
  },
  {
    name: 'Studio City',
    region: 'San Fernando Valley',
    cluster: 'valley-east',
    nearby: ['Sherman Oaks', 'North Hollywood', 'Toluca Lake', 'Universal City'],
    anchors: ['Ventura Boulevard', 'CBS Radford and the studios', 'the 101', 'the LA River headwaters'],
    identity:
      'A walkable, media-industry Valley neighborhood on Ventura Blvd, just over the hill from Hollywood.',
    confusions: ['Sherman Oaks', 'North Hollywood'],
    hook: 'Ventura Blvd by the studios — the closest Valley hop over the hill.',
  },
  {
    name: 'Van Nuys',
    region: 'San Fernando Valley',
    cluster: 'valley-east',
    nearby: ['Sherman Oaks', 'Valley Glen', 'North Hills', 'Panorama City'],
    anchors: ['Van Nuys Boulevard', 'the Valley government center', 'Van Nuys Airport', 'the 405'],
    identity:
      'The dense, working civic and industrial core of the Valley — older and more central than the polished Ventura Blvd strip.',
    confusions: ['Panorama City'],
    hook: "The Valley's working-class civic center, north of Sherman Oaks.",
  },
  {
    name: 'North Hollywood',
    region: 'San Fernando Valley',
    cluster: 'valley-east',
    nearby: ['Studio City', 'Valley Village', 'Burbank', 'Toluca Lake'],
    anchors: ['the NoHo Arts District', 'Lankershim Boulevard', 'the Metro B/Red Line terminus'],
    identity:
      'An eastern-Valley neighborhood with the NoHo Arts District and the subway to Hollywood; rapidly developing.',
    confusions: ['Valley Village', 'Studio City'],
    hook: 'NoHo Arts District + the Red Line terminus.',
  },

  // ---- South LA -----------------------------------------------------------
  {
    name: 'Leimert Park',
    region: 'South LA',
    cluster: 'south',
    nearby: ['Baldwin Hills/Crenshaw', 'View Park', 'Hyde Park', 'Jefferson Park'],
    anchors: ['Leimert Park Village', 'Crenshaw Boulevard', 'the World Stage', 'the new K Line'],
    identity:
      'The cultural heart of Black Los Angeles — jazz, art, and Afrocentric commerce around Leimert Park Village.',
    confusions: ['Baldwin Hills/Crenshaw'],
    hook: 'Cultural heart of Black LA, at Crenshaw and 43rd.',
  },
  {
    name: 'Baldwin Hills/Crenshaw',
    region: 'South LA',
    cluster: 'south',
    nearby: ['Leimert Park', 'View Park', 'Culver City', 'Jefferson Park'],
    anchors: ['Crenshaw Boulevard', 'the Baldwin Hills', 'Kenneth Hahn Park', 'the K Line'],
    identity:
      'A hillside and commercial district anchoring middle-class Black LA, along the Crenshaw corridor below the Baldwin Hills.',
    confusions: ['Leimert Park'],
    hook: 'The Crenshaw corridor with the Baldwin Hills rising above it.',
  },
  {
    name: 'Watts',
    region: 'South LA',
    cluster: 'south',
    nearby: ['Willowbrook', 'Florence', 'Green Meadows', 'Compton'],
    anchors: ['the Watts Towers', '103rd Street', 'the Blue/A Line', 'Jordan Downs'],
    identity:
      'A historically Black, now heavily Latino South LA neighborhood — flashpoint of the 1965 uprising and home of the Watts Towers.',
    confusions: ['Compton'],
    hook: 'The Watts Towers, deep South LA along the A Line.',
  },

  // ---- Harbor -------------------------------------------------------------
  {
    name: 'San Pedro',
    region: 'Harbor',
    cluster: 'harbor',
    nearby: ['Wilmington', 'Long Beach', 'Rancho Palos Verdes', 'Harbor City'],
    anchors: ['the Port of LA', 'the USS Iowa', 'the Korean Friendship Bell', 'the 110 terminus'],
    identity:
      "LA's harbor town at the far south end — port, fishing and longshore heritage, physically separate from the rest of the city.",
    confusions: ['Long Beach', 'Wilmington'],
    hook: 'The Port; the far-south harbor end of the 110.',
  },
  {
    name: 'Wilmington',
    region: 'Harbor',
    cluster: 'harbor',
    nearby: ['San Pedro', 'Carson', 'Long Beach', 'Harbor City'],
    anchors: ['the Port and refineries', 'Avalon Boulevard', 'the 110'],
    identity:
      "A working harbor community of refineries and port jobs, next to San Pedro at LA's southern tip.",
    confusions: ['San Pedro'],
    hook: 'Refineries and port jobs, next to San Pedro.',
  },
];

export const BY_NAME = Object.fromEntries(NEIGHBORHOODS.map((n) => [n.name, n]));
export const CARD_NAMES = NEIGHBORHOODS.map((n) => n.name);

export function neighborhoodsInCluster(clusterId) {
  return NEIGHBORHOODS.filter((n) => n.cluster === clusterId);
}

export function neighborhoodsInRegion(region) {
  return NEIGHBORHOODS.filter((n) => n.region === region);
}
