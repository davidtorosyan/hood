// Lightweight, privacy-friendly analytics (GoatCounter) + crash visibility + the
// context we attach to bug reports. Everything is gated on config, so it's a
// no-op until the codes below are filled in.
import { store } from './store.js';

// ---- Fill these in ---------------------------------------------------------
// GoatCounter: after signing up, this is your counter endpoint, e.g.
//   'https://myhood.goatcounter.com/count'
const GOATCOUNTER = 'https://jimbo84.goatcounter.com/count';
// A form endpoint that emails you the report (Formspree recommended), e.g.
//   'https://formspree.io/f/abcdwxyz'
const FORM_ENDPOINT = 'https://formspree.io/f/xqevnyeo';
// ----------------------------------------------------------------------------

const SUPPORT_EMAIL = 'support@jimbo84.com';
const VERSION = typeof __COMMIT__ === 'string' ? __COMMIT__ : 'dev';
const BUILT = typeof __BUILD_TIME__ === 'string' ? new Date(__BUILD_TIME__) : null;
// Shown in small print on the home screen, so "am I on the latest?" is one glance.
export const BUILD = BUILT
  ? `build ${VERSION} · ${BUILT.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${BUILT.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  : `build ${VERSION}`;

// Only count real visits: not local dev, not automated browsers (the screenshot
// harness), so the numbers mean something.
const ENABLED = import.meta.env.PROD && !navigator.webdriver;

// Count via GoatCounter's no-JavaScript pixel endpoint (`/count?p=…`) rather
// than loading its third-party script: nothing external runs in the page, and
// there's no script to pin with an integrity hash. No cookies either way.
function hit(params) {
  const q = new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2) });
  const img = new Image();
  img.referrerPolicy = 'no-referrer-when-downgrade';
  img.src = `${GOATCOUNTER}?${q}`;
}

// Count the visit and start counting crashes. Called once at startup.
export function initTelemetry() {
  if (GOATCOUNTER && ENABLED) {
    hit({ p: location.pathname, t: document.title, r: document.referrer, s: `${screen.width},${screen.height}` });
  }
  // Crash visibility: count JS errors / rejected promises as events. Guard the
  // resource-load "error" events (they have no `.error`).
  window.addEventListener('error', (e) => e.error && countEvent('js-error'));
  window.addEventListener('unhandledrejection', () => countEvent('js-error'));
}

// Record a named event. Gameplay events: puzzle-start / puzzle-solved /
// puzzle-skip, hint-neighbor / hint-ghost, zoom-in, card-open,
// search, context-tap.
export function countEvent(name) {
  if (!ENABLED || !GOATCOUNTER) return;
  hit({ p: name, t: name, e: 'true' });
}

// The context we attach to a bug report — where they were and which build.
export function bugContext() {
  const nav = store.nav?.();
  const where = nav ? `${nav.node} · ${store.puzzle(nav.node) ? 'mid-puzzle' : 'browsing'}` : 'home';
  return {
    where,
    version: VERSION,
    size: `${window.innerWidth}×${window.innerHeight}`,
    url: location.href,
    ua: navigator.userAgent,
  };
}

export const reportConfig = { FORM_ENDPOINT, SUPPORT_EMAIL };
