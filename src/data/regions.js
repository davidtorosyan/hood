// A contiguous, geography-first partition of the urbanized LA County metro into
// ~7 top-level regions. Each region's piece is the union of its areas, so the
// region shapes must each be a single connected blob (the puzzle build grows
// connected sub-groups from here). LA-City neighborhoods, independent cities, and
// unincorporated communities are grouped by WHERE they are, not by jurisdiction.
//
// This file is also the INCLUDE LIST: only areas named here enter the puzzle.
// Excluded on purpose (see EXCLUDED below): the Antelope Valley + Santa Clarita
// Valley (cut off from the basin by mountains), the mountain/forest slivers, and
// Catalina Island (a disconnected island).
//
// Regenerate geometry after editing: `npm run build:shapes`.
export const REGION_GROUPS = {
  'San Fernando Valley': [
    'Agoura Hills', 'Arleta', 'Burbank', 'Calabasas', 'Canoga Park', 'Chatsworth',
    'Chatsworth Reservoir', 'Encino', 'Granada Hills', 'Hansen Dam', 'Hidden Hills',
    'Lake Balboa', 'Lake View Terrace', 'Mission Hills', 'North Hills', 'North Hollywood',
    'Northridge', 'Pacoima', 'Panorama City', 'Porter Ranch', 'Reseda', 'San Fernando',
    'Sepulveda Basin', 'Shadow Hills', 'Sherman Oaks', 'Studio City', 'Sun Valley',
    'Sunland', 'Sylmar', 'Tarzana', 'Toluca Lake', 'Tujunga', 'Universal City',
    'Valley Glen', 'Valley Village', 'Van Nuys', 'West Hills', 'Westlake Village',
    'Winnetka', 'Woodland Hills',
  ],
  'San Gabriel Valley': [
    // Verdugos + Northeast LA + Eastside
    'Atwater Village', 'Boyle Heights', 'Cypress Park', 'Eagle Rock', 'East Los Angeles',
    'El Sereno', 'Elysian Valley', 'Glassell Park', 'Glendale', 'Highland Park',
    'La Cañada Flintridge', 'La Crescenta-Montrose', 'Lincoln Heights', 'Montecito Heights',
    'Mount Washington',
    // Pasadena & west SGV
    'Alhambra', 'Altadena', 'Arcadia', 'Bradbury', 'Duarte', 'East Pasadena',
    'East San Gabriel', 'Mayflower Village', 'Monrovia', 'Monterey Park', 'Pasadena',
    'Rosemead', 'San Gabriel', 'San Marino', 'San Pasqual', 'Sierra Madre',
    'South El Monte', 'South Pasadena', 'South San Gabriel', 'Temple City',
    // East SGV
    'Avocado Heights', 'Azusa', 'Baldwin Park', 'Charter Oak', 'Citrus', 'Claremont',
    'Covina', 'Diamond Bar', 'El Monte', 'Glendora', 'Hacienda Heights', 'Industry',
    'Irwindale', 'La Puente', 'La Verne', 'North El Monte', 'Pomona', 'Ramona',
    'Rowland Heights', 'San Dimas', 'South Diamond Bar', 'South San Jose Hills',
    'Valinda', 'Walnut', 'West Covina', 'West Puente Valley', 'West San Dimas',
    'Whittier Narrows',
  ],
  'Central L.A.': [
    'Beverly Grove', 'Carthay', 'Chinatown', 'Downtown', 'East Hollywood', 'Echo Park',
    'Elysian Park', 'Fairfax', 'Griffith Park', 'Hancock Park', 'Hollywood',
    'Hollywood Hills', 'Hollywood Hills West', 'Koreatown', 'Larchmont', 'Los Feliz',
    'Mid-City', 'Mid-Wilshire', 'Pico-Union', 'Silver Lake', 'West Hollywood',
    'Westlake', 'Windsor Square',
  ],
  'Westside & Coast': [
    'Bel-Air', 'Beverly Crest', 'Beverly Hills', 'Beverlywood', 'Brentwood',
    'Century City', 'Cheviot Hills', 'Culver City', 'Del Rey', 'Malibu', 'Mar Vista',
    'Marina del Rey', 'Pacific Palisades', 'Palms', 'Pico-Robertson', 'Playa Vista',
    'Playa del Rey', 'Rancho Park', 'Santa Monica', 'Sawtelle', 'Topanga',
    'Veterans Administration', 'Venice', 'West Los Angeles', 'Westchester', 'Westwood',
  ],
  'South Bay & Harbor': [
    'Alondra Park', 'Carson', 'Del Aire', 'El Segundo', 'Gardena', 'Harbor City',
    'Harbor Gateway', 'Hawthorne', 'Hermosa Beach', 'Inglewood', 'Lawndale', 'Lennox',
    'Lomita', 'Manhattan Beach', 'Palos Verdes Estates', 'Rancho Palos Verdes',
    'Redondo Beach', 'Rolling Hills', 'Rolling Hills Estates', 'San Pedro', 'Torrance',
    'West Carson', 'Wilmington',
  ],
  'South L.A.': [
    'Adams-Normandie', 'Arlington Heights', 'Athens', 'Baldwin Hills/Crenshaw', 'Bell',
    'Broadway-Manchester', 'Central-Alameda', 'Chesterfield Square', 'Cudahy',
    'Exposition Park', 'Florence', 'Florence-Firestone', 'Gramercy Park', 'Green Meadows',
    'Harvard Heights', 'Harvard Park', 'Historic South-Central', 'Huntington Park',
    'Hyde Park', 'Jefferson Park', 'Ladera Heights', 'Leimert Park', 'Manchester Square',
    'Maywood', 'South Park', 'University Park', 'Vermont Knolls', 'Vermont Square',
    'Vermont Vista', 'Vermont-Slauson', 'Vernon', 'View Park-Windsor Hills',
    'Walnut Park', 'Watts', 'West Adams', 'Westmont', 'Willowbrook',
  ],
  'Gateway Cities': [
    'Artesia', 'Bell Gardens', 'Bellflower', 'Cerritos', 'Commerce', 'Compton',
    'Downey', 'East Compton', 'East La Mirada', 'Hawaiian Gardens', 'La Habra Heights',
    'La Mirada', 'Lakewood', 'Long Beach', 'Lynwood', 'Montebello', 'North Whittier',
    'Norwalk', 'Paramount', 'Pico Rivera', 'Rancho Dominguez', 'Santa Fe Springs',
    'Signal Hill', 'South Gate', 'South Whittier', 'West Compton',
    'West Whittier-Los Nietos', 'Whittier',
  ],
};

// Excluded from the puzzle (documented so it's clear they were a choice, not an
// oversight): high desert, Santa Clarita backcountry, wildland, and the island.
export const EXCLUDED = [
  // Antelope Valley
  'Acton', 'Agua Dulce', 'Desert View Highlands', 'Elizabeth Lake', 'Green Valley',
  'Lake Hughes', 'Lake Los Angeles', 'Lancaster', 'Leona Valley', 'Littlerock',
  'Northeast Antelope Valley', 'Northwest Antelope Valley', 'Northwest Palmdale',
  'Palmdale', 'Quartz Hill', 'Southeast Antelope Valley', 'Sun Village', 'Vincent',
  // Santa Clarita Valley
  'Santa Clarita', 'Castaic', 'Castaic Canyons', 'Hasley Canyon', 'Ridge Route',
  'Stevenson Ranch', 'Val Verde',
  // Mountain / forest wildland
  'Angeles Crest', 'Lopez/Kagel Canyons', 'Tujunga Canyons',
  'Unincorporated Santa Monica Mountains', 'Unincorporated Santa Susana Mountains',
  // Island
  'Avalon', 'Unincorporated Catalina Island',
];
