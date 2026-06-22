// Per-neighborhood info shown on the tap-to-open card at the leaf level.
//
// `pop` is an APPROXIMATE resident population, rounded — these are a learning
// aid, not census-grade. Figures are anchored to the L.A. Almanac's
// neighborhood-population approximation (built from census tracts), with a few
// corrected where its neighborhood definition differs from the LA Times
// "Mapping L.A." boundaries this game uses (e.g. Koreatown, Pico-Union, which
// Mapping L.A. draws much larger/denser). `type` answers "is this a
// neighborhood, a park, …" — every leaf here is a district of the City of LA;
// the five mostly-unpopulated ones are flagged as open space (Phase 2 cities
// like Glendale would be `City`). `fact` is an optional one-liner.
//
// Keys must match the leaf node labels (= Mapping L.A. neighborhood names).

const N = 'Neighborhood of L.A.';
const PARK = 'Park / open space';

export const PLACES = {
  // ---- San Fernando Valley ----
  Arleta: { pop: 33000, type: N },
  'Canoga Park': { pop: 58000, type: N, fact: 'Home to the original site of the Cheesecake Factory test kitchen and a historic stretch of Sherman Way.' },
  Chatsworth: { pop: 40000, type: N, fact: 'Backdrop for countless Westerns at the rugged Stoney Point and Iverson Movie Ranch.' },
  'Chatsworth Reservoir': { pop: null, type: PARK, fact: 'A drained former reservoir, now a fenced wildlife and bird habitat in the far west Valley.' },
  Encino: { pop: 53000, type: N, fact: 'Its name is Spanish for "oak"; the Encino Oak Tree stood for an estimated 1,000 years.' },
  'Granada Hills': { pop: 62000, type: N, fact: 'The street of palm trees on White Oak Ave starred in the film "Sleepless in Seattle."' },
  'Hansen Dam': { pop: null, type: PARK, fact: 'A flood-control basin turned recreation area with a lake and one of the Valley’s biggest swim complexes.' },
  'Lake Balboa': { pop: 23000, type: N, fact: 'Built around a man-made lake fed by reclaimed water, ringed by cherry-blossom trees.' },
  'Lake View Terrace': { pop: 14000, type: N },
  'Mission Hills': { pop: 23000, type: N, fact: 'Home to the Mission San Fernando Rey de España, founded 1797, which gives the Valley its name.' },
  'North Hills': { pop: 50000, type: N },
  'North Hollywood': { pop: 130000, type: N, fact: 'The NoHo Arts District is packed with small theaters — one of the densest theater scenes in the U.S.' },
  Northridge: { pop: 76000, type: N, fact: 'Gave its name to the destructive 1994 earthquake; home to Cal State Northridge.' },
  Pacoima: { pop: 70000, type: N, fact: 'Hometown of rock pioneer Ritchie Valens; one of the Valley’s oldest Mexican-American communities.' },
  'Panorama City': { pop: 65000, type: N, fact: 'A planned postwar community built by Kaiser around a since-closed GM assembly plant.' },
  'Porter Ranch': { pop: 27000, type: N },
  Reseda: { pop: 66000, type: N, fact: 'The title and setting of a Tom Petty song; "The Karate Kid" was set here too.' },
  'Sepulveda Basin': { pop: null, type: PARK, fact: 'A 2,000-acre flood basin with sports fields, a wildlife lake, and a Japanese garden.' },
  'Shadow Hills': { pop: 4000, type: N, fact: 'A semi-rural, horse-keeping pocket of the northeast Valley.' },
  'Sherman Oaks': { pop: 68000, type: N, fact: 'The Sherman Oaks Galleria was the ur-mall of "Valley girl" culture in the 1980s.' },
  'Studio City': { pop: 40000, type: N, fact: 'Named for the film studio (now CBS Studio Center) that opened here in 1928.' },
  'Sun Valley': { pop: 44000, type: N },
  Sunland: { pop: 18000, type: N },
  Sylmar: { pop: 81000, type: N, fact: 'Famous for olive groves; the 1971 Sylmar quake reshaped California’s building codes.' },
  Tarzana: { pop: 35000, type: N, fact: 'Named after Tarzan — author Edgar Rice Burroughs owned a ranch here and named it for his character.' },
  'Toluca Lake': { pop: 4400, type: N, fact: 'A leafy enclave around a private lake; longtime home to Bob Hope and other Hollywood stars.' },
  Tujunga: { pop: 26000, type: N },
  'Valley Glen': { pop: 39000, type: N },
  'Valley Village': { pop: 24000, type: N },
  'Van Nuys': { pop: 110000, type: N, fact: 'The Valley’s civic hub and one of its most populous districts; the GM "Van Nuys" plant built Camaros until 1992.' },
  'West Hills': { pop: 33000, type: N },
  Winnetka: { pop: 50000, type: N },
  'Woodland Hills': { pop: 70000, type: N, fact: 'Routinely the hottest spot in L.A.; the open-air Topanga mall anchors its commercial core.' },

  // ---- Northeast LA ----
  'Atwater Village': { pop: 10000, type: N, fact: 'A walkable strip along the L.A. River, popular with cyclists on the river path.' },
  'Cypress Park': { pop: 13500, type: N },
  'Eagle Rock': { pop: 34000, type: N, fact: 'Named for a giant rock whose hollow casts an eagle-shaped shadow; home to Occidental College.' },
  'Elysian Valley': { pop: 6400, type: N, fact: 'Nicknamed "Frogtown" for the frogs that once swarmed up from the L.A. River.' },
  'Glassell Park': { pop: 22000, type: N },
  'Highland Park': { pop: 42000, type: N, fact: 'One of L.A.’s oldest suburbs; the York/Figueroa corridor is the heart of Northeast L.A.' },
  'Mount Washington': { pop: 11000, type: N, fact: 'A steep hillside neighborhood once served by an incline railway to a hilltop hotel.' },

  // ---- Eastside ----
  'Boyle Heights': { pop: 84000, type: N, fact: 'A historic gateway for immigrants; Mariachi Plaza is where mariachi bands gather for hire.' },
  'El Sereno': { pop: 38000, type: N },
  'Lincoln Heights': { pop: 29000, type: N, fact: 'One of L.A.’s oldest neighborhoods, just northeast of Downtown across the river.' },
  'Montecito Heights': { pop: 3700, type: N },

  // ---- Central LA ----
  'Beverly Grove': { pop: 20000, type: N, fact: 'Home to the Beverly Center mall and the bustling design stores of Beverly Boulevard.' },
  Carthay: { pop: 6000, type: N, fact: 'Carthay Circle’s 1920s Spanish-Revival homes are a designated historic district.' },
  Chinatown: { pop: 20000, type: N, fact: 'Today’s "New Chinatown" (1938) was the first in the U.S. owned by the Chinese community itself.' },
  Downtown: { pop: 62000, type: N, fact: 'Its residential population has more than doubled since 2000 as old offices became lofts.' },
  'East Hollywood': { pop: 41000, type: N, fact: 'Home to Thai Town and Little Armenia, plus the historic Vista Theatre.' },
  'Echo Park': { pop: 29000, type: N, fact: 'Echo Park Lake’s lotus bed throws a beloved annual Lotus Festival.' },
  'Elysian Park': { pop: null, type: PARK, fact: 'L.A.’s second-oldest park and home to Dodger Stadium.' },
  Fairfax: { pop: 10500, type: N, fact: 'Historic heart of Jewish L.A. (Canter’s Deli) and now a streetwear destination.' },
  'Griffith Park': { pop: null, type: PARK, fact: 'One of North America’s largest urban parks; home to the Observatory, Zoo, and Hollywood Sign.' },
  'Hancock Park': { pop: 12000, type: N, fact: 'Grand 1920s mansions built with old oil money; the La Brea Tar Pits sit at its edge.' },
  Hollywood: { pop: 100000, type: N, fact: 'The Walk of Fame has more than 2,700 terrazzo-and-brass stars.' },
  'Hollywood Hills': { pop: 13000, type: N, fact: 'Winding canyons below the Hollywood Sign, long home to musicians and movie stars.' },
  'Hollywood Hills West': { pop: 28000, type: N, fact: 'Includes the Sunset Strip’s western reaches and the Laurel Canyon music scene.' },
  Koreatown: { pop: 120000, type: N, fact: 'One of the densest neighborhoods in the U.S., packed with 24-hour restaurants and karaoke.' },
  Larchmont: { pop: 4300, type: N, fact: 'Larchmont Boulevard feels like a small-town main street in the middle of the city.' },
  'Los Feliz': { pop: 32000, type: N, fact: 'Home to two landmark houses by Frank Lloyd Wright and the gates of Griffith Park.' },
  'Mid-City': { pop: 35000, type: N },
  'Mid-Wilshire': { pop: 15000, type: N, fact: 'Includes Museum Row and the La Brea Tar Pits along the "Miracle Mile."' },
  'Pico-Union': { pop: 40000, type: N, fact: 'A dense, largely Central American immigrant neighborhood just west of Downtown.' },
  'Silver Lake': { pop: 36000, type: N, fact: 'Named for a reservoir and water-board chief Herman Silver; a hub of indie music and design.' },
  Westlake: { pop: 115000, type: N, fact: 'Among the densest districts in the U.S.; MacArthur Park and its lake are its center.' },
  'Windsor Square': { pop: 2900, type: N, fact: 'A stately early-1900s district; the Getty House here is the L.A. mayor’s official residence.' },

  // ---- Westside ----
  'Bel-Air': { pop: 7700, type: N, fact: 'A gated hillside enclave of estates; one of the wealthiest neighborhoods in the country.' },
  'Beverly Crest': { pop: 5300, type: N, fact: 'Hillside mansions in and above Benedict and Coldwater canyons (not to be confused with Beverly Hills).' },
  Beverlywood: { pop: 5000, type: N },
  Brentwood: { pop: 34000, type: N, fact: 'Home to the hilltop Getty Center and its art collection.' },
  'Century City': { pop: 3800, type: N, fact: 'A high-rise office district built on the former backlot of 20th Century Fox.' },
  'Cheviot Hills': { pop: 3800, type: N },
  'Del Rey': { pop: 34000, type: N },
  'Mar Vista': { pop: 42000, type: N },
  'Pacific Palisades': { pop: 24000, type: N, fact: 'A coastal-bluff community; the Getty Villa and Will Rogers’ ranch sit at its edges.' },
  Palms: { pop: 29000, type: N, fact: 'The oldest annexed neighborhood in the city of L.A. (1915).' },
  'Pico-Robertson': { pop: 25000, type: N, fact: 'A center of Orthodox Jewish life, with kosher delis and synagogues along Pico Blvd.' },
  'Playa Vista': { pop: 10000, type: N, fact: 'Built on Howard Hughes’ old airfield, where the "Spruce Goose" was constructed.' },
  'Playa del Rey': { pop: 13000, type: N, fact: 'A small beach town wedged between the ocean and LAX’s runways.' },
  'Rancho Park': { pop: 10000, type: N },
  Sawtelle: { pop: 14000, type: N, fact: 'Sawtelle Boulevard’s "Japantown" is one of L.A.’s best ramen-and-sushi corridors.' },
  Venice: { pop: 31000, type: N, fact: 'Founded in 1905 with real canals modeled on Venice, Italy; the boardwalk is a circus of street performers.' },
  'West Los Angeles': { pop: 50000, type: N },
  Westchester: { pop: 41000, type: N, fact: 'Grew up around LAX; Loyola Marymount University sits on its bluff.' },
  Westwood: { pop: 53000, type: N, fact: 'Home to UCLA and the Village; the Hammer Museum and a famous Bruin theater anchor it.' },

  // ---- South LA ----
  'Adams-Normandie': { pop: 7000, type: N },
  'Arlington Heights': { pop: 14000, type: N },
  'Baldwin Hills/Crenshaw': { pop: 30000, type: N, fact: 'A historic heart of Black L.A.; the Baldwin Hills offer some of the best city views.' },
  'Broadway-Manchester': { pop: 12000, type: N },
  'Central-Alameda': { pop: 27000, type: N },
  'Chesterfield Square': { pop: 8000, type: N },
  'Exposition Park': { pop: 40000, type: N, fact: 'Home to the L.A. Coliseum, museums, and the new home of the Lucas Museum; borders USC.' },
  Florence: { pop: 35000, type: N },
  'Gramercy Park': { pop: 10000, type: N },
  'Green Meadows': { pop: 20000, type: N },
  'Harvard Heights': { pop: 11000, type: N, fact: 'Known for a dense cluster of grand turn-of-the-century homes, many now historic landmarks.' },
  'Harvard Park': { pop: 13000, type: N },
  'Historic South-Central': { pop: 44000, type: N, fact: 'Once the spine of L.A.’s Central Avenue jazz scene in the 1920s–40s.' },
  'Hyde Park': { pop: 31000, type: N },
  'Jefferson Park': { pop: 18500, type: N },
  'Leimert Park': { pop: 9500, type: N, fact: 'The cultural center of Black art and music in L.A.; Leimert Park Village hosts drum circles and galleries.' },
  'Manchester Square': { pop: 9000, type: N },
  'South Park': { pop: 49000, type: N },
  'University Park': { pop: 25000, type: N, fact: 'Wraps around USC; home to the ornate 1920s mansions of West Adams’ Chester Place.' },
  'Vermont Knolls': { pop: 27000, type: N },
  'Vermont Square': { pop: 13000, type: N, fact: 'Built around the city’s oldest branch library, a 1913 Carnegie library still in use.' },
  'Vermont Vista': { pop: 25000, type: N },
  'Vermont-Slauson': { pop: 25000, type: N },
  Watts: { pop: 38000, type: N, fact: 'Home to the Watts Towers, hand-built over 33 years by Simon Rodia from steel, tile, and glass.' },
  'West Adams': { pop: 23000, type: N, fact: 'One of L.A.’s oldest affluent districts, lined with Victorian and Craftsman mansions.' },
};
