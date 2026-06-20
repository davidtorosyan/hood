// A clean, contiguous partition of all 114 City-of-LA neighborhoods into the
// top-level regions, used to build the "LA regions" jigsaw (each region piece is
// the union of its neighborhoods). This is a coarser, geography-first grouping
// than the per-card `region` field in neighborhoods.js — its only job is to make
// recognizable, contiguous region shapes that tile the city.
export const REGION_GROUPS = {
  'San Fernando Valley': [
    'Arleta', 'Canoga Park', 'Chatsworth', 'Chatsworth Reservoir', 'Encino',
    'Granada Hills', 'Hansen Dam', 'Lake Balboa', 'Lake View Terrace', 'Mission Hills',
    'North Hills', 'North Hollywood', 'Northridge', 'Pacoima', 'Panorama City',
    'Porter Ranch', 'Reseda', 'Sepulveda Basin', 'Shadow Hills', 'Sherman Oaks',
    'Studio City', 'Sun Valley', 'Sunland', 'Sylmar', 'Tarzana', 'Toluca Lake',
    'Tujunga', 'Valley Glen', 'Valley Village', 'Van Nuys', 'West Hills', 'Winnetka',
    'Woodland Hills',
  ],
  'Northeast LA': [
    'Atwater Village', 'Cypress Park', 'Eagle Rock', 'Elysian Valley', 'Glassell Park',
    'Highland Park', 'Mount Washington',
  ],
  Eastside: ['Boyle Heights', 'El Sereno', 'Lincoln Heights', 'Montecito Heights'],
  'Central LA': [
    'Beverly Grove', 'Carthay', 'Chinatown', 'Downtown', 'East Hollywood', 'Echo Park',
    'Elysian Park', 'Fairfax', 'Griffith Park', 'Hancock Park', 'Hollywood',
    'Hollywood Hills', 'Hollywood Hills West', 'Koreatown', 'Larchmont', 'Los Feliz',
    'Mid-City', 'Mid-Wilshire', 'Pico-Union', 'Silver Lake', 'Westlake', 'Windsor Square',
  ],
  Westside: [
    'Bel-Air', 'Beverly Crest', 'Beverlywood', 'Brentwood', 'Century City',
    'Cheviot Hills', 'Del Rey', 'Mar Vista', 'Pacific Palisades', 'Palms',
    'Pico-Robertson', 'Playa Vista', 'Playa del Rey', 'Rancho Park', 'Sawtelle',
    'Venice', 'West Los Angeles', 'Westchester', 'Westwood',
  ],
  'South LA': [
    'Adams-Normandie', 'Arlington Heights', 'Baldwin Hills/Crenshaw', 'Broadway-Manchester',
    'Central-Alameda', 'Chesterfield Square', 'Exposition Park', 'Florence', 'Gramercy Park',
    'Green Meadows', 'Harvard Heights', 'Harvard Park', 'Historic South-Central', 'Hyde Park',
    'Jefferson Park', 'Leimert Park', 'Manchester Square', 'South Park', 'University Park',
    'Vermont Knolls', 'Vermont Square', 'Vermont Vista', 'Vermont-Slauson', 'Watts',
    'West Adams',
  ],
  Harbor: ['Harbor City', 'Harbor Gateway', 'San Pedro', 'Wilmington'],
};
