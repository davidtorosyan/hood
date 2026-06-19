// SVG map of LA's neighborhoods + the geo plumbing the game needs:
// projecting taps to lng/lat, hit-testing, and distance scoring.
import { geoMercator, geoPath, geoContains, geoDistance } from 'd3-geo';
import boundaries from './data/boundaries.json';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 12;
const FIT_WIDTH = 1000;
const EARTH_KM = 6371;

const featureByName = new Map(boundaries.features.map((f) => [f.properties.name, f]));

// One projection fit to the full extent of LA, shared by render + invert.
const projection = geoMercator().fitWidth(FIT_WIDTH, boundaries);
const pathGen = geoPath(projection);
const [[x0, y0], [x1, y1]] = pathGen.bounds(boundaries);
const VIEWBOX = [x0 - PAD, y0 - PAD, x1 - x0 + 2 * PAD, y1 - y0 + 2 * PAD];

export function centroidOf(name) {
  return featureByName.get(name).properties.centroid; // [lng, lat]
}

export function quizFeatureNames() {
  return [...featureByName.keys()];
}

// Distance in km between a [lng,lat] point and a neighborhood's centroid.
export function distanceKm(name, lngLat) {
  return geoDistance(centroidOf(name), lngLat) * EARTH_KM;
}

// Did the point land inside the neighborhood's actual boundary?
export function isInside(name, lngLat) {
  return geoContains(featureByName.get(name), lngLat);
}

export function createMap(container) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', VIEWBOX.join(' '));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('map');

  const land = document.createElementNS(SVG_NS, 'g');
  const markers = document.createElementNS(SVG_NS, 'g');
  markers.classList.add('markers');
  svg.append(land, markers);

  const pathByName = new Map();
  for (const f of boundaries.features) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', pathGen(f));
    p.setAttribute('class', 'hood');
    p.dataset.name = f.properties.name;
    land.append(p);
    pathByName.set(f.properties.name, p);
  }

  container.append(svg);

  // Convert a pointer event to [lng, lat] using the SVG's own coordinate space.
  function eventToLngLat(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM().inverse());
    return projection.invert([local.x, local.y]);
  }

  function clearState() {
    for (const p of pathByName.values()) {
      p.classList.remove('target', 'correct', 'dim');
    }
    markers.replaceChildren();
  }

  function setHighlight(name, cls = 'target') {
    pathByName.get(name)?.classList.add(cls);
  }

  function dimAllExcept(name) {
    for (const [n, p] of pathByName) p.classList.toggle('dim', n !== name);
  }

  function addMarker(lngLat, cls) {
    const [x, y] = projection(lngLat);
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', y);
    c.setAttribute('r', cls === 'pin-you' ? 9 : 7);
    c.setAttribute('class', `marker ${cls}`);
    markers.append(c);
    return c;
  }

  return {
    svg,
    eventToLngLat,
    clearState,
    setHighlight,
    dimAllExcept,
    addMarker,
    onTap(handler) {
      svg.addEventListener('pointerdown', handler);
    },
    setTappable(on) {
      svg.classList.toggle('tappable', on);
    },
  };
}
